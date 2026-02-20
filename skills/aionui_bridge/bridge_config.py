#!/usr/bin/env python3
"""
NanoClaw ↔ AionUI 雙向橋接共用配置
從環境變數載入，無 hardcode
"""

import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional


# === 路徑配置 ===
PROJECT_ROOT = Path("/Users/ryan/nanoclaw")
SKILLS_DIR = PROJECT_ROOT / "skills"
AIONUI_CONFIG_DIR = Path.home() / "Library/Application Support/AionUi"

# 共用對話狀態檔案
BRIDGE_STATE_FILE = "/tmp/nanoclaw_aionui_bridge_state.json"


# === 環境變數載入 ===
def load_env():
    """從多個位置載入環境變數"""
    env_paths = [
        PROJECT_ROOT / ".env",
        PROJECT_ROOT / ".env.semiao",
        SKILLS_DIR / "universal-api-router" / ".env",
    ]

    for env_path in env_paths:
        if env_path.exists():
            from dotenv import load_dotenv

            load_dotenv(env_path, override=False)


@dataclass
class TelegramConfig:
    bot_token: str
    chat_id: str
    asis_chat_id: str = "1469326872"  # 預設

    @property
    def is_valid(self) -> bool:
        return bool(self.bot_token and self.chat_id)


@dataclass
class NanoClawConfig:
    host: str = "localhost"
    port: int = 3000
    webhook_url: Optional[str] = None

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


@dataclass
class AionUIConfig:
    # 從 AionUI 環境變數獲取
    opencode_url: str = os.getenv("OPENCODE_URL", "http://localhost:8787")
    session_id: Optional[str] = None  # 動態設定


@dataclass
class BridgeConfig:
    telegram: TelegramConfig
    nanoclaw: NanoClawConfig
    aionui: AionUIConfig

    # 通用的對話追蹤
    max_history: int = 50
    poll_interval: float = 2.0  # 秒
    timeout: int = 120  # 秒

    # 調試模式
    debug: bool = os.getenv("BRIDGE_DEBUG", "").lower() in ("1", "true", "yes")


def get_bridge_config() -> BridgeConfig:
    """獲取橋接配置"""
    load_env()

    # 從環境變數讀取 TG 配置
    telegram = TelegramConfig(
        bot_token=os.getenv(
            "TELEGRAM_BOT_TOKEN", os.getenv("TELEGRAM_BOT_TOKEN_ASIS", "")
        ),
        chat_id=os.getenv("TG_CHAT_ID", os.getenv("ASIS_CHAT_ID", "1469326872")),
        asis_chat_id=os.getenv("ASIS_CHAT_ID", "1469326872"),
    )

    nanoclaw = NanoClawConfig(
        host=os.getenv("NANOCLAW_HOST", "localhost"),
        port=int(os.getenv("NANOCLAW_PORT", "3000")),
        webhook_url=os.getenv("NANOCLAW_WEBHOOK_URL", None),
    )

    aionui = AionUIConfig(
        opencode_url=os.getenv("OPENCODE_URL", "http://localhost:8787"),
    )

    return BridgeConfig(
        telegram=telegram,
        nanoclaw=nanoclaw,
        aionui=aionui,
    )


# === 全域配置實例 ===
_config: Optional[BridgeConfig] = None


def get_config() -> BridgeConfig:
    """取得全域配置（單例）"""
    global _config
    if _config is None:
        _config = get_bridge_config()
    return _config
