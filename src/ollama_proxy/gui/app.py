"""Ollama Proxy GUI Entry Point"""

import streamlit as st

st.set_page_config(
    page_title="Ollama Proxy",
    page_icon="🤖",
    layout="wide",
)

pg = st.navigation(
    [
        st.Page("dashboard.py", title="ダッシュボード", icon="📊"),
        st.Page("settings.py", title="設定", icon="⚙️"),
    ]
)
pg.run()
