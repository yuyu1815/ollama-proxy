# Development Guidelines for ollama-proxy

This document contains essential information for developers and AI agents working on this project.

## 1. Build and Configuration Instructions

### Prerequisites
- Python 3.12 or higher.
- [uv](https://docs.astral.sh/uv/) (Fast Python package manager)

### Environment Setup
We use `uv` for project management.
```powershell
# Sync project and create virtual environment
uv sync

# Activate the virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
```

### Dependency Management
- **Add a dependency**: `uv add package_name`
- **Add a development dependency**: `uv add --dev package_name`
- **Remove a dependency**: `uv remove package_name`
- **Sync dependencies**: `uv sync`

---

## 2. Testing and Linting Information

### Configuring and Running Tests
We use `pytest` for unit testing.
```powershell
# Run all tests using uv
uv run pytest

# Run a specific test file
uv run pytest path/to/test_file.py
```

### Linting and Formatting
We use `ruff` for linting and formatting.
```powershell
# Check for lint errors
uv run ruff check

# Fix lint errors automatically
uv run ruff check --fix

# Format code
uv run ruff format
```

### Type Checking
We use `mypy` for static type checking.
```powershell
# Run type check
uv run mypy .
```

### Guidelines for Adding New Tests
1. Follow the **AAA pattern (Arrange-Act-Assert)**:
   - **Arrange**: Set up prerequisites, inputs, and mocks.
   - **Act**: Call the function or method being tested.
   - **Assert**: Verify the result is as expected.
2. Maintain the **Test Pyramid**:
   - Focus on many unit tests for individual functions.
   - Use fewer integration tests for component interactions.
   - Keep E2E tests to a minimum for critical user flows.
3. Test edge cases and error conditions, not just the happy path.

### Simple Test Example
```python
def test_addition():
    # Arrange
    a = 1
    b = 2
    
    # Act
    result = a + b
    
    # Assert
    assert result == 3
```

---

## 3. Development Protocols and Best Practices

### 1. Development Flow (Ticket-Driven & Trunk-Based)
- **1 Ticket = 1 Purpose**: Separate specification changes from refactoring.
- **Small PRs**: Aim for under 200 lines. 1 PR = 1 intent.
- **Commit by Semantic Units**: Ensure commit history is easy to follow.

### 2. Code Quality (Readability & Maintainability)
- **Keep Nesting Shallow**: Use early returns and guard clauses.
- **Intentional Naming**: Function and variable names should clearly state their purpose.
- **Side Effects**: Isolate I/O operations (DB, HTTP) to the boundaries; keep business logic pure.
- **Consistency**: Follow existing patterns in the codebase.

### 3. Optimization Guidelines
- **Avoid Premature Optimization**: "Premature optimization is the root of all evil."
- **Optimize only based on measured data**: Use profiling tools to identify actual bottlenecks.
- **Make it work -> Make it right -> Make it fast**: Prioritize correctness and readability first.

### 4. AI Collaboration Rules
- **AI as a "Junior Developer"**: Always review AI-generated code.
- **No Error Suppression**: Do not ignore linting errors or suppress exceptions without a valid reason.
- **TDD approach for AI**: Ask AI to "add tests first, then implement" to ensure safety.
- **Context is King**: Provide rich context (error messages, technical constraints) when prompting.

### 5. Documentation
- **ADR (Architecture Decision Records)**: Record significant architectural decisions and their "Why" in `/docs/adr/`.
- **Inline Comments**: Focus on explaining "Why" something is done rather than "What" is done.

---

*Note: This document is a living guide. Please update it as the project evolves.*
