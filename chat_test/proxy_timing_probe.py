import argparse
import asyncio
import json
import statistics
import time
from typing import Any, Optional

import aiohttp


def _now() -> float:
    return time.perf_counter()


def _build_trace_config() -> aiohttp.TraceConfig:
    trace_config = aiohttp.TraceConfig()

    async def on_request_start(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        timings["request_start"] = _now()

    async def on_dns_resolvehost_start(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        timings["dns_start"] = _now()

    async def on_dns_resolvehost_end(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        timings["dns_end"] = _now()

    async def on_connection_create_start(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        timings["connect_start"] = _now()

    async def on_connection_create_end(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        timings["connect_end"] = _now()

    async def on_connection_reuseconn(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        timings["connection_reused"] = True

    async def on_response_chunk_received(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        if "first_byte" not in timings:
            timings["first_byte"] = _now()

    async def on_request_end(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        timings["request_end"] = _now()

    async def on_request_exception(session, trace_config_ctx, params):
        timings = trace_config_ctx.trace_request_ctx["timings"]
        timings["request_exception"] = _now()

    trace_config.on_request_start.append(on_request_start)
    trace_config.on_dns_resolvehost_start.append(on_dns_resolvehost_start)
    trace_config.on_dns_resolvehost_end.append(on_dns_resolvehost_end)
    trace_config.on_connection_create_start.append(on_connection_create_start)
    trace_config.on_connection_create_end.append(on_connection_create_end)
    trace_config.on_connection_reuseconn.append(on_connection_reuseconn)
    trace_config.on_response_chunk_received.append(on_response_chunk_received)
    trace_config.on_request_end.append(on_request_end)
    trace_config.on_request_exception.append(on_request_exception)

    return trace_config


def _calc_duration(timings: dict[str, Any], start_key: str, end_key: str) -> Optional[float]:
    start = timings.get(start_key)
    end = timings.get(end_key)
    if start is None or end is None:
        return None
    return end - start


async def _one_request(
    session: aiohttp.ClientSession,
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    stream: bool,
) -> dict[str, Any]:
    trace_ctx = {"timings": {"connection_reused": False}}
    start = _now()
    status = None
    size_bytes = 0
    error = None

    try:
        async with session.post(
            url,
            json=payload,
            headers=headers,
            trace_request_ctx=trace_ctx,
        ) as response:
            status = response.status
            if stream:
                async for chunk in response.content.iter_chunked(1024):
                    size_bytes += len(chunk)
            else:
                body = await response.read()
                size_bytes = len(body)
    except Exception as exc:
        error = str(exc)

    end = _now()
    timings = trace_ctx["timings"]

    return {
        "status": status,
        "error": error,
        "bytes": size_bytes,
        "timings": timings,
        "total": end - start,
        "dns": _calc_duration(timings, "dns_start", "dns_end"),
        "connect": _calc_duration(timings, "connect_start", "connect_end"),
        "ttfb": _calc_duration(timings, "request_start", "first_byte"),
        "request": _calc_duration(timings, "request_start", "request_end"),
    }


async def _run_once(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    stream: bool,
) -> dict[str, Any]:
    trace_config = _build_trace_config()
    async with aiohttp.ClientSession(trace_configs=[trace_config]) as session:
        return await _one_request(session, url, payload, headers, stream)


async def _run_parallel(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    stream: bool,
    concurrency: int,
    runs: int,
) -> list[dict[str, Any]]:
    trace_config = _build_trace_config()
    semaphore = asyncio.Semaphore(concurrency)
    results: list[dict[str, Any]] = []

    async with aiohttp.ClientSession(trace_configs=[trace_config]) as session:
        async def worker():
            async with semaphore:
                result = await _one_request(session, url, payload, headers, stream)
                results.append(result)

        tasks = [asyncio.create_task(worker()) for _ in range(runs)]
        await asyncio.gather(*tasks)

    return results


def _summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    def collect(key: str) -> list[float]:
        return [r[key] for r in results if isinstance(r.get(key), (int, float))]

    summary = {
        "count": len(results),
        "status_counts": {},
        "errors": [r["error"] for r in results if r.get("error")],
    }

    for r in results:
        status = r.get("status")
        summary["status_counts"][str(status)] = summary["status_counts"].get(str(status), 0) + 1

    for key in ["dns", "connect", "ttfb", "request", "total"]:
        values = collect(key)
        if not values:
            summary[key] = None
            continue
        if len(values) < 2:
            summary[key] = {
                "min": values[0],
                "max": values[0],
                "mean": values[0],
                "p50": values[0],
                "p90": values[0],
            }
            continue
        summary[key] = {
            "min": min(values),
            "max": max(values),
            "mean": statistics.mean(values),
            "p50": statistics.median(values),
            "p90": statistics.quantiles(values, n=10)[8],
        }
    return summary


def _build_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.mode == "proxy":
        return {
            "model": args.model,
            "messages": [{"role": "user", "content": args.prompt}],
            "stream": args.stream,
        }
    return {
        "model": args.model,
        "messages": [{"role": "user", "content": args.prompt}],
        "stream": args.stream,
    }


def _build_headers(args: argparse.Namespace) -> dict[str, str]:
    headers = {}
    if args.api_key:
        headers["Authorization"] = f"Bearer {args.api_key}"
    return headers


def _build_url(args: argparse.Namespace) -> str:
    if args.mode == "proxy":
        return f"{args.proxy_url.rstrip('/')}/api/chat"
    return f"{args.base_url.rstrip('/')}/chat/completions"


def main() -> None:
    parser = argparse.ArgumentParser(description="Proxy timing probe")
    parser.add_argument("--mode", choices=["proxy", "direct"], default="proxy")
    parser.add_argument("--proxy-url", default="http://127.0.0.1:11434")
    parser.add_argument("--base-url", default="https://api.z.ai/api/paas/v4")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--model", default="z.ai")
    parser.add_argument("--prompt", default="こんにちは")
    parser.add_argument("--stream", action="store_true")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--concurrency", type=int, default=1)
    args = parser.parse_args()

    url = _build_url(args)
    payload = _build_payload(args)
    headers = _build_headers(args)

    if args.concurrency <= 1:
        results = asyncio.run(_run_parallel(url, payload, headers, args.stream, 1, args.runs))
    else:
        results = asyncio.run(
            _run_parallel(url, payload, headers, args.stream, args.concurrency, args.runs)
        )

    for result in results:
        print(json.dumps(result, ensure_ascii=False))

    summary = _summarize(results)
    print(json.dumps({"summary": summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()