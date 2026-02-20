#!/usr/bin/env python3
"""
NanoClaw 接收 AionUI 訊息的 Webhook 伺服器
提供 HTTP 端點接收來自 AionUI 的訊息，並處理回覆
"""

import sys
import os
import json
import time
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

try:
    from fastapi import FastAPI, Request, HTTPException
    from fastapi.responses import JSONResponse
    import uvicorn

    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    print("Warning: fastapi not installed. Using simple HTTP server instead.")

sys.path.insert(0, str(Path(__file__).parent.parent))
from aionui_bridge.bridge_config import get_config, load_env

load_env()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nanoclaw_webhook")


class ResponseCallback:
    """處理回覆回調的類別"""

    def __init__(self):
        self.config = get_config()
        self.pending_callbacks = {}

    def register_callback(self, message_id: int, callback_url: str, timeout: int = 120):
        self.pending_callbacks[message_id] = {
            "callback_url": callback_url,
            "registered_at": time.time(),
            "timeout": timeout,
        }

    def handle_response(self, response_text: str) -> list:
        """處理來自 NanoClaw 的回覆，發送到所有待回調"""
        import requests

        delivered = []
        current_time = time.time()

        for msg_id, callback in list(self.pending_callbacks.items()):
            if current_time - callback["registered_at"] > callback["timeout"]:
                del self.pending_callbacks[msg_id]
                continue

            try:
                payload = {
                    "response": response_text,
                    "timestamp": datetime.now().isoformat(),
                    "original_message_id": msg_id,
                }

                response = requests.post(
                    callback["callback_url"], json=payload, timeout=30
                )

                if response.status_code == 200:
                    delivered.append(msg_id)
                    del self.pending_callbacks[msg_id]

            except Exception as e:
                logger.error(f"Callback failed for {msg_id}: {e}")

        return delivered


class NanoClawWebhookServer:
    """NanoClaw Webhook 伺服器"""

    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.config = get_config()
        self.host = host
        self.port = port
        self.callback_handler = ResponseCallback()

        if FASTAPI_AVAILABLE:
            self.app = FastAPI(title="NanoClaw Webhook")
            self._setup_routes()
        else:
            self.app = None

    def _setup_routes(self):
        @self.app.get("/health")
        async def health():
            return {"status": "healthy", "timestamp": datetime.now().isoformat()}

        @self.app.post("/webhook/aionui")
        async def receive_from_aionui(request: Request):
            body = await request.json()

            message = body.get("message", "")
            callback_url = body.get("callback_url")
            message_id = body.get("message_id", int(time.time() * 1000))

            if not message:
                raise HTTPException(status_code=400, detail="Message is required")

            logger.info(f"Received from AionUI: {message[:50]}...")

            if callback_url:
                self.callback_handler.register_callback(message_id, callback_url)

            tg_response = await self._send_to_telegram(message)

            return {
                "status": "received",
                "message_id": message_id,
                "telegram_response": tg_response,
            }

        @self.app.post("/callback/response")
        async def receive_nanoclaw_response(request: Request):
            body = await request.json()

            response_text = body.get("response", "")
            original_msg_id = body.get("original_message_id")

            delivered = self.callback_handler.handle_response(response_text)

            return {"status": "processed", "delivered_to": delivered}

        @self.app.get("/status")
        async def status():
            return {
                "pending_callbacks": len(self.callback_handler.pending_callbacks),
                "config": {
                    "host": self.config.telegram.chat_id,
                    "has_token": bool(self.config.telegram.bot_token),
                },
            }

    async def _send_to_telegram(self, message: str) -> dict:
        """發送訊息到 Telegram"""
        import requests

        cfg = self.config.telegram
        url = f"https://api.telegram.org/bot{cfg.bot_token}/sendMessage"
        payload = {"chat_id": cfg.chat_id, "text": f"[AionUI]\n{message}"}

        try:
            response = requests.post(url, json=payload, timeout=30)
            result = response.json()

            if result.get("ok"):
                return {"status": "sent", "message_id": result["result"]["message_id"]}
            return {"status": "error", "detail": result.get("description")}

        except Exception as e:
            return {"status": "error", "detail": str(e)}

    def run(self):
        if not FASTAPI_AVAILABLE:
            print(
                "Error: fastapi is required. Install with: pip install fastapi uvicorn"
            )
            sys.exit(1)

        logger.info(f"Starting webhook server on {self.host}:{self.port}")
        uvicorn.run(self.app, host=self.host, port=self.port)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="NanoClaw Webhook Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind")

    args = parser.parse_args()

    server = NanoClawWebhookServer(host=args.host, port=args.port)
    server.run()


if __name__ == "__main__":
    main()
