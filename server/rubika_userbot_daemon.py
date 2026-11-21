#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
سرویس داخلی اتصال واقعی Userbot روبیکا و پخش زنده صوتی در ویس‌چت گروهی (rubpy[rtc] + aiortc + FFmpeg)
پشتیبانی از احراز هویت غیرتعاملی (ارسال کد پیامکی / تایید کد / رمز دومرحله‌ای) و استریم زنده WebRTC
"""

import argparse
import asyncio
import hashlib
import json
import os
import pathlib
import re
import shutil
import sys
import time
from datetime import datetime
from fractions import Fraction
from typing import Any, Callable, Coroutine, Dict, List, Optional
from urllib.parse import quote

try:
    import aiohttp
except Exception:
    aiohttp = None  # type: ignore

try:
    import numpy as np
except Exception:
    np = None  # type: ignore

try:
    import av
    from aiortc import (
        MediaStreamTrack,
        RTCConfiguration,
        RTCIceServer,
        RTCPeerConnection,
        RTCSessionDescription,
    )
    from aiortc.contrib.media import MediaPlayer
    from aiortc.mediastreams import MediaStreamError
except Exception:
    av = None  # type: ignore
    MediaStreamTrack = object  # type: ignore
    RTCConfiguration = None  # type: ignore
    RTCIceServer = None  # type: ignore
    RTCPeerConnection = None  # type: ignore
    RTCSessionDescription = None  # type: ignore
    MediaPlayer = None  # type: ignore
    MediaStreamError = Exception  # type: ignore

try:
    from Crypto.PublicKey import RSA
    from Crypto.Signature import pkcs1_15
    from rubpy import Client, exceptions
    from rubpy.crypto import Crypto
except Exception:
    Client = None  # type: ignore
    Crypto = None  # type: ignore
    exceptions = None  # type: ignore
    RSA = None  # type: ignore
    pkcs1_15 = None  # type: ignore


BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "vc-cache"
SESSION_PREFIX = str(DATA_DIR / "parya_userbot")
SESSION_FILE = DATA_DIR / "parya_userbot.rp"


def normalize_phone(raw_phone: str) -> str:
    trans = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    cleaned = raw_phone.translate(trans).strip()
    cleaned = re.sub(r"[\s\-\(\)]", "", cleaned)
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    elif cleaned.startswith("00"):
        cleaned = cleaned[2:]
    if cleaned.startswith("09") and len(cleaned) == 11:
        cleaned = "98" + cleaned[1:]
    elif cleaned.startswith("9") and len(cleaned) == 10:
        cleaned = "98" + cleaned
    return cleaned


def extract_field(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    val = getattr(obj, key, None)
    if val is not None:
        return val
    find_fn = getattr(obj, "find_keys", None)
    if callable(find_fn):
        try:
            found = find_fn(key)
            if found is not None:
                return found
        except Exception:
            pass
    orig = getattr(obj, "original_update", None)
    if isinstance(orig, dict) and key in orig:
        return orig[key]
    return default


async def close_client_safely(client: Any) -> None:
    if not client:
        return
    try:
        conn = getattr(client, "connection", None)
        http_sess = getattr(conn, "session", None)
        if http_sess and not http_sess.closed:
            await http_sess.close()
    except Exception:
        pass
    try:
        sess = getattr(client, "session", None)
        sql_conn = getattr(sess, "_connection", None)
        if sql_conn:
            sql_conn.close()
    except Exception:
        pass


def inspect_audio_libs() -> Dict[str, Dict[str, Any]]:
    libs: Dict[str, Dict[str, Any]] = {}
    for mod in ("rubpy", "aiortc", "av", "yt_dlp", "mutagen", "pydub", "numpy"):
        try:
            loaded = __import__(mod)
            ver = getattr(loaded, "__version__", "") or getattr(loaded, "version", None)
            if mod == "yt_dlp" and ver is not None and hasattr(ver, "__version__"):
                ver = ver.__version__
            libs[mod] = {"installed": True, "version": str(ver) if isinstance(ver, (str, int, float)) else ""}
        except Exception:
            libs[mod] = {"installed": False, "version": ""}
    libs["ffmpeg"] = {"installed": bool(shutil.which("ffmpeg")), "version": "system" if shutil.which("ffmpeg") else ""}
    return libs


async def cmd_status() -> Dict[str, Any]:
    audio_libs = inspect_audio_libs()
    if Client is None:
        return {"ok": False, "runtimeReady": False, "hasSession": False, "audioLibs": audio_libs, "error": "rubpy نصب نیست"}
    if not SESSION_FILE.exists():
        return {"ok": True, "runtimeReady": True, "hasSession": False, "audioLibs": audio_libs}

    client = Client(name=SESSION_PREFIX, display_welcome=False)
    try:
        await client.connect()
        if not client.auth or not client.private_key:
            return {"ok": True, "runtimeReady": True, "hasSession": False, "audioLibs": audio_libs}
        client.key = Crypto.passphrase(client.auth)
        client.decode_auth = Crypto.decode_auth(client.auth)
        client.import_key = pkcs1_15.new(RSA.import_key(client.private_key.encode()))
        me = await client.get_me()
        user = getattr(me, "user", None)
        first = extract_field(user, "first_name", "") or ""
        last = extract_field(user, "last_name", "") or ""
        username = extract_field(user, "username", "") or ""
        phone = extract_field(user, "phone", "") or ""
        guid = extract_field(user, "user_guid", "") or ""
        acc_name = f"{first} {last}".strip() or username or phone or "حساب روبیکا"
        return {
            "ok": True,
            "runtimeReady": True,
            "hasSession": True,
            "audioLibs": audio_libs,
            "accountName": acc_name,
            "username": username,
            "phone": phone,
            "userGuid": guid,
        }
    except Exception as exc:
        return {"ok": False, "runtimeReady": True, "hasSession": False, "audioLibs": audio_libs, "error": str(exc)}
    finally:
        await close_client_safely(client)


async def cmd_send_code(phone_raw: str, pass_key: Optional[str]) -> Dict[str, Any]:
    if Client is None:
        return {"ok": False, "error": "کتابخانه rubpy روی سرور نصب نشده است."}
    phone = normalize_phone(phone_raw)
    if not re.match(r"^\d{10,15}$", phone):
        return {"ok": False, "error": "شماره موبایل معتبر نیست (مثال: 09123456789)."}

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    client = Client(name=SESSION_PREFIX, display_welcome=False)
    try:
        await client.connect()
        res = await client.send_code(
            phone_number=phone,
            pass_key=pass_key.strip() if pass_key and pass_key.strip() else None,
            send_type="SMS",
        )
        status = extract_field(res, "status", "")
        phone_code_hash = extract_field(res, "phone_code_hash", "")
        hint_pass_key = extract_field(res, "hint_pass_key", "")
        if status == "SendPassKey":
            return {
                "ok": False,
                "status": "SendPassKey",
                "phone": phone,
                "hintPassKey": hint_pass_key or "",
                "error": "این حساب رمز تایید دومرحله‌ای دارد. لطفاً رمز دوم را وارد کنید.",
            }
        if not phone_code_hash:
            return {
                "ok": False,
                "status": status or "ERROR",
                "phone": phone,
                "error": f"ارسال کد تایید ناموفق بود ({status or 'پاسخ نامعتبر'}).",
            }
        return {
            "ok": True,
            "status": status or "OK",
            "phone": phone,
            "phoneCodeHash": phone_code_hash,
        }
    except Exception as exc:
        return {"ok": False, "error": f"خطا در ارسال کد تایید روبیکا: {exc}"}
    finally:
        await close_client_safely(client)


async def cmd_sign_in(phone_raw: str, code_raw: str, phone_code_hash: str) -> Dict[str, Any]:
    if Client is None:
        return {"ok": False, "error": "کتابخانه rubpy روی سرور نصب نشده است."}
    phone = normalize_phone(phone_raw)
    trans = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    code = code_raw.translate(trans).strip()
    if not code or not phone_code_hash:
        return {"ok": False, "error": "کد تایید و شناسه ارسال کد الزامی است."}

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    client = Client(name=SESSION_PREFIX, display_welcome=False)
    try:
        await client.connect()
        public_key, client.private_key = Crypto.create_keys()
        result = await client.sign_in(
            phone_code=code,
            phone_number=phone,
            phone_code_hash=phone_code_hash,
            public_key=public_key,
        )
        status = extract_field(result, "status", "")
        if status != "OK":
            return {
                "ok": False,
                "status": status,
                "error": f"تایید کد ناموفق بود ({status}). کد را مجدداً بررسی کنید.",
            }
        enc_auth = extract_field(result, "auth", "")
        if not enc_auth:
            return {"ok": False, "error": "توکن احراز هویت از روبیکا دریافت نشد."}

        decrypted_auth = Crypto.decrypt_RSA_OAEP(client.private_key, enc_auth)
        client.key = Crypto.passphrase(decrypted_auth)
        client.auth = decrypted_auth
        client.decode_auth = Crypto.decode_auth(client.auth)
        client.import_key = pkcs1_15.new(RSA.import_key(client.private_key.encode()))

        user_obj = extract_field(result, "user", None)
        user_guid = extract_field(user_obj, "user_guid", "") or extract_field(result, "user_guid", "")
        user_phone = extract_field(user_obj, "phone", "") or phone

        client.session.insert(
            phone_number=user_phone,
            auth=client.auth,
            guid=user_guid,
            user_agent=client.user_agent,
            private_key=client.private_key,
        )

        try:
            await client.register_device(device_model="ParyaMusicStudio")
        except Exception:
            pass

        acc_name = phone
        try:
            me = await client.get_me()
            me_user = extract_field(me, "user", None)
            first = extract_field(me_user, "first_name", "") or ""
            last = extract_field(me_user, "last_name", "") or ""
            acc_name = f"{first} {last}".strip() or extract_field(me_user, "username", "") or phone
        except Exception:
            pass

        return {
            "ok": True,
            "accountName": acc_name,
            "userGuid": user_guid,
            "phone": user_phone,
        }
    except Exception as exc:
        return {"ok": False, "error": f"خطا در ورود با کد روبیکا: {exc}"}
    finally:
        await close_client_safely(client)


def normalize_invite_link(raw_link: str) -> str:
    cleaned = raw_link.strip()
    m = re.search(r"(?:https?://)?rubika\.ir/joing/([A-Za-z0-9_\-]+)", cleaned, re.IGNORECASE)
    if m:
        return m.group(1)
    if "/" in cleaned:
        return cleaned.rstrip("/").split("/")[-1]
    return cleaned


def parse_rubika_join_target(raw_target: str) -> Dict[str, str]:
    cleaned = raw_target.strip()
    m_group = re.search(r"(?:https?://)?rubika\.ir/joing/([A-Za-z0-9_\-]+)", cleaned, re.IGNORECASE)
    if m_group:
        return {"kind": "group_invite", "value": m_group.group(1)}
    m_chan_invite = re.search(r"(?:https?://)?rubika\.ir/joinc/([A-Za-z0-9_\-]+)", cleaned, re.IGNORECASE)
    if m_chan_invite:
        return {"kind": "channel_invite", "value": m_chan_invite.group(1)}
    m_url_user = re.search(r"(?:https?://)?rubika\.ir/([A-Za-z0-9_]{3,})", cleaned, re.IGNORECASE)
    if m_url_user:
        uname = m_url_user.group(1)
        if uname.lower() not in ("joing", "joinc"):
            return {"kind": "username", "value": uname}
    m_at = re.search(r"@([A-Za-z0-9_]{3,})", cleaned)
    if m_at:
        return {"kind": "username", "value": m_at.group(1)}
    if cleaned.startswith("c0"):
        return {"kind": "channel_guid", "value": cleaned}
    if cleaned.startswith("g0"):
        return {"kind": "group_guid", "value": cleaned}
    return {"kind": "raw", "value": normalize_invite_link(cleaned)}


async def join_target_with_client(client: Any, raw_target: str) -> Dict[str, Any]:
    parsed = parse_rubika_join_target(raw_target)
    kind = parsed["kind"]
    val = parsed["value"]
    if not val or len(val) < 3:
        return {"ok": False, "error": "لینک دعوت گروه یا آیدی کانال روبیکا معتبر نیست."}

    title = ""
    member_count = 0
    chat_guid = ""
    chat_type = "group"
    username = ""
    invite_link = ""

    try:
        if kind == "username":
            username = f"@{val.lstrip('@')}"
            obj_res = await client.get_object_by_username(val.lstrip("@"))
            exist = extract_field(obj_res, "exist", True)
            if exist is False:
                return {"ok": False, "error": f"آیدی {username} در روبیکا پیدا نشد."}
            obj_type = str(extract_field(obj_res, "type", "") or "").lower()
            ch_obj = extract_field(obj_res, "channel", None)
            grp_obj = extract_field(obj_res, "group", None)
            chat_obj = extract_field(obj_res, "chat", None)
            if ch_obj or obj_type == "channel":
                target = ch_obj or chat_obj or obj_res
                chat_guid = str(extract_field(target, "channel_guid", "") or extract_field(obj_res, "object_guid", "") or "")
                title = str(extract_field(target, "channel_title", "") or extract_field(target, "title", "") or username)
                member_count = int(extract_field(target, "count_members", 0) or 0)
                chat_type = "channel"
                if chat_guid:
                    try:
                        await client.join_channel_action(chat_guid, "Join")
                    except Exception:
                        pass
                invite_link = f"https://rubika.ir/{val.lstrip('@')}"
            elif grp_obj or obj_type == "group":
                target = grp_obj or chat_obj or obj_res
                chat_guid = str(extract_field(target, "group_guid", "") or extract_field(obj_res, "object_guid", "") or "")
                title = str(extract_field(target, "group_title", "") or extract_field(target, "title", "") or username)
                member_count = int(extract_field(target, "count_members", 0) or 0)
                chat_type = "group"
                invite_link = f"https://rubika.ir/{val.lstrip('@')}"
            else:
                return {"ok": False, "error": f"آیدی {username} مربوط به کانال یا گروه روبیکا نیست."}

        elif kind == "channel_guid":
            chat_guid = val
            chat_type = "channel"
            try:
                await client.join_channel_action(chat_guid, "Join")
            except Exception:
                pass
            info = await client.get_channel_info(chat_guid)
            ch_obj = extract_field(info, "channel", info)
            title = str(extract_field(ch_obj, "channel_title", "") or extract_field(ch_obj, "title", "") or "کانال روبیکا")
            uname = str(extract_field(ch_obj, "username", "") or "").strip()
            if uname:
                username = f"@{uname.lstrip('@')}"
                invite_link = f"https://rubika.ir/{uname.lstrip('@')}"

        elif kind == "channel_invite":
            chat_type = "channel"
            try:
                prev = await client.channel_preview_by_join_link(val)
                prev_ch = extract_field(prev, "channel", prev)
                title = str(extract_field(prev_ch, "channel_title", "") or extract_field(prev_ch, "title", "") or "")
                member_count = int(extract_field(prev_ch, "count_members", 0) or 0)
                chat_guid = str(extract_field(prev_ch, "channel_guid", "") or "")
            except Exception:
                pass
            join_res = await client.join_channel_by_link(val)
            ch_obj = extract_field(join_res, "channel", join_res)
            chat_guid = str(extract_field(ch_obj, "channel_guid", "") or extract_field(join_res, "chat_guid", "") or chat_guid)
            if not title:
                title = str(extract_field(ch_obj, "channel_title", "") or extract_field(ch_obj, "title", "") or "کانال روبیکا")
            invite_link = f"https://rubika.ir/joinc/{val}"

        else:
            hash_link = val
            chat_type = "group"
            try:
                prev = await client.group_preview_by_join_link(hash_link)
                prev_group = extract_field(prev, "group", prev)
                title = str(extract_field(prev_group, "group_title", "") or extract_field(prev_group, "title", "") or "")
                member_count = int(extract_field(prev_group, "count_members", 0) or 0)
                chat_guid = str(extract_field(prev_group, "group_guid", "") or "")
            except Exception:
                pass

            join_res = await client.join_group(hash_link)
            grp_obj = extract_field(join_res, "group", join_res)
            chat_guid = str(
                extract_field(grp_obj, "group_guid", "")
                or extract_field(join_res, "chat_guid", "")
                or chat_guid
            )
            if not title:
                title = str(
                    extract_field(grp_obj, "group_title", "")
                    or extract_field(grp_obj, "title", "")
                    or "گروه روبیکا"
                )
            if not member_count:
                try:
                    member_count = int(extract_field(grp_obj, "count_members", 0) or 0)
                except Exception:
                    member_count = 0
            invite_link = f"https://rubika.ir/joing/{hash_link}"

        if not chat_guid or not (chat_guid.startswith("g0") or chat_guid.startswith("c0")):
            return {"ok": False, "error": "عضویت انجام نشد یا لینک/آیدی منقضی و نامعتبر است."}

        return {
            "ok": True,
            "chatGuid": chat_guid,
            "chatType": chat_type,
            "username": username,
            "title": title,
            "memberCount": member_count,
            "inviteLink": invite_link,
        }
    except Exception as exc:
        return {"ok": False, "error": f"خطا در عضویت خودکار: {exc}"}


async def cmd_join_group(raw_link: str) -> Dict[str, Any]:
    if Client is None:
        return {"ok": False, "error": "کتابخانه rubpy روی سرور نصب نشده است."}
    if not SESSION_FILE.exists():
        return {"ok": False, "error": "ابتدا باید با شماره موبایل اکانت Userbot روبیکا وارد شوید."}

    client = Client(name=SESSION_PREFIX, display_welcome=False)
    try:
        await client.connect()
        if not client.auth or not client.private_key:
            return {"ok": False, "error": "سشن Userbot نامعتبر است. لطفاً مجدداً وارد شوید."}
        client.key = Crypto.passphrase(client.auth)
        client.decode_auth = Crypto.decode_auth(client.auth)
        client.import_key = pkcs1_15.new(RSA.import_key(client.private_key.encode()))
        return await join_target_with_client(client, raw_link)
    except Exception as exc:
        return {"ok": False, "error": f"خطا در عضویت با لینک/آیدی: {exc}"}
    finally:
        await close_client_safely(client)


class SilentPCMTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self, pts_state: Optional[Dict[str, int]] = None) -> None:
        super().__init__()
        self._pts_state = pts_state if pts_state is not None else {"pts": 0}
        self._muted = False

    def pause(self) -> None:
        self._muted = True

    def resume(self) -> None:
        self._muted = False

    def set_muted(self, muted: bool) -> None:
        self._muted = muted

    def set_volume(self, _volume: int) -> None:
        pass

    def set_audio_options(self, _channels: str, _normalize: bool) -> None:
        pass

    async def recv(self) -> Any:
        await asyncio.sleep(0.02)
        frame = av.AudioFrame(format="s16", layout="stereo", samples=960)
        frame.sample_rate = 48000
        frame.pts = self._pts_state["pts"]
        self._pts_state["pts"] += 960
        frame.time_base = Fraction(1, 48000)
        frame.planes[0].update(bytes(frame.planes[0].buffer_size))
        return frame


class ControlledAudioTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(
        self,
        player: Any,
        pts_state: Optional[Dict[str, int]] = None,
        volume: int = 80,
        channels: str = "stereo",
        normalize: bool = True,
        muted: bool = False,
        on_ended: Optional[Callable[[], Coroutine[Any, Any, None]]] = None,
    ) -> None:
        super().__init__()
        self.player = player
        self._pts_state = pts_state if pts_state is not None else {"pts": 0}
        self._volume = max(0, min(100, int(volume)))
        self._channels = "mono" if channels == "mono" else "stereo"
        self._normalize = bool(normalize)
        self._paused = False
        self._muted = bool(muted)
        self._ended_notified = False
        self._on_ended = on_ended
        self._resampler = (
            av.AudioResampler(format="s16", layout="stereo", rate=48000)
            if av is not None
            else None
        )

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    def set_muted(self, muted: bool) -> None:
        self._muted = bool(muted)

    def set_volume(self, volume: int) -> None:
        self._volume = max(0, min(100, int(volume)))

    def set_audio_options(self, channels: str, normalize: bool) -> None:
        self._channels = "mono" if channels == "mono" else "stereo"
        self._normalize = bool(normalize)

    @property
    def is_actively_singing(self) -> bool:
        return not self._paused and not self._muted and not self._ended_notified

    def _make_silence_frame(self) -> Any:
        frame = av.AudioFrame(format="s16", layout="stereo", samples=960)
        frame.sample_rate = 48000
        frame.pts = self._pts_state["pts"]
        self._pts_state["pts"] += 960
        frame.time_base = Fraction(1, 48000)
        frame.planes[0].update(bytes(frame.planes[0].buffer_size))
        return frame

    def _process_audio_frame(self, frame: Any) -> Any:
        # Ensure strict 48kHz stereo s16 format for OpusEncoder stability
        if (
            self._resampler is not None
            and (
                getattr(frame.format, "name", "") != "s16"
                or getattr(frame.layout, "name", "") != "stereo"
                or getattr(frame, "sample_rate", 48000) != 48000
            )
        ):
            resampled = self._resampler.resample(frame)
            if resampled:
                frame = resampled[0]

        if self._muted or self._volume <= 0:
            for plane in frame.planes:
                try:
                    plane.update(bytes(plane.buffer_size))
                except Exception:
                    pass
        elif np is not None and (
            self._normalize or self._channels == "mono" or self._volume != 100
        ):
            try:
                arr = frame.to_ndarray()
                samples = arr.astype(np.float32) / 32768.0
                if self._channels == "mono" and samples.ndim == 2 and samples.shape[1] >= 2:
                    left = samples[:, 0::2]
                    right = samples[:, 1::2]
                    mono = 0.5 * (left + right)
                    samples[:, 0::2] = mono
                    samples[:, 1::2] = mono
                if self._normalize:
                    rms = float(np.sqrt(np.mean(samples * samples)))
                    if 0.005 < rms < 0.14:
                        boost = min(2.2, 0.16 / rms)
                        samples *= boost
                gain = max(0.0, min(1.25, self._volume / 100.0))
                samples *= gain
                # Soft limiter to keep Rubika voice chat crystal clear without clipping
                peak = float(np.max(np.abs(samples)))
                if peak > 0.92:
                    samples = np.tanh(samples * 1.15) * 0.94
                out_i16 = np.clip(samples * 32767.0, -32768, 32767).astype(np.int16)
                out_frame = av.AudioFrame.from_ndarray(out_i16, format="s16", layout="stereo")
                out_frame.sample_rate = 48000
                frame = out_frame
            except Exception:
                pass

        frame.pts = self._pts_state["pts"]
        frame.time_base = Fraction(1, 48000)
        self._pts_state["pts"] += int(getattr(frame, "samples", 960) or 960)
        return frame

    async def recv(self) -> Any:
        if self._paused:
            await asyncio.sleep(0.02)
            if av is not None:
                return self._make_silence_frame()
        try:
            frame = await self.player.audio.recv()
            return self._process_audio_frame(frame)
        except MediaStreamError:
            if not self._ended_notified:
                self._ended_notified = True
                if self._on_ended:
                    asyncio.create_task(self._on_ended())
            await asyncio.sleep(0.02)
            if av is not None:
                return self._make_silence_frame()
            raise


class RubikaLiveDaemon:
    def __init__(self, server_url: str) -> None:
        self.server_url = server_url.rstrip("/")
        self.client: Any = None
        self.http: Optional[aiohttp.ClientSession] = None
        self.pc: Any = None
        self.player: Any = None
        self.audio_track: Optional[Any] = None
        self.speaking_task: Optional[asyncio.Task] = None
        self.heartbeat_task: Optional[asyncio.Task] = None
        self.active_chat_guid: Optional[str] = None
        self.active_vc_id: Optional[str] = None
        self.current_track_label: str = ""
        self.account_name: str = "Userbot"
        self.daily_counts: Dict[str, int] = {}
        self.available_groups: List[Dict[str, str]] = []
        self.moderation_configs: Dict[str, Dict[str, Any]] = {}
        self.spam_tracker: Dict[str, List[float]] = {}
        self.audio_profile: Dict[str, Any] = {
            "profile": "balance",
            "streamBitrateKbps": 64,
            "channels": "stereo",
            "sampleRate": 44100,
            "volumeNormalization": True,
        }
        self.current_stream_url: Optional[str] = None
        self.current_track_title: str = ""
        self.current_track_artist: str = ""
        self.current_volume: int = 80
        self.rtp_pts_state: Dict[str, int] = {"pts": 0}
        self.ice_state: str = "new"
        self.conn_state: str = "new"
        self.last_vc_error: str = ""
        self._did_initial_sync: bool = False
        self._channel_use_group_activity: bool = False
        self.user_info_cache: Dict[str, Dict[str, str]] = {}
        self.sent_bot_msg_ids: set[str] = set()
        self.sent_bot_fingerprints: List[tuple[str, float]] = []
        self.creator_username: str = "@Paria25805"
        self.creator_rubika_guid: str = ""
        self.sudo_user_ids: List[str] = []

    def _build_rtc_configuration(self) -> Any:
        if RTCConfiguration is None or RTCIceServer is None:
            return None
        return RTCConfiguration(
            iceServers=[
                RTCIceServer(urls="stun:stun.cloudflare.com:3478"),
                RTCIceServer(urls="stun:stun.l.google.com:19302"),
            ]
        )

    def _tune_opus_sdp(self, sdp: str) -> str:
        try:
            bitrate_kbps = int(self.audio_profile.get("streamBitrateKbps") or 64)
            bitrate_bps = max(16000, min(256000, bitrate_kbps * 1000))
            stereo_val = "0" if self.audio_profile.get("channels") == "mono" else "1"
            out_lines: List[str] = []
            saw_fmtp_96 = any(l.startswith("a=fmtp:96") for l in sdp.splitlines())
            for line in sdp.splitlines():
                if line.startswith("a=fmtp:") and ("minptime=" in line or line.startswith("a=fmtp:96")):
                    cleaned = re.sub(r";?\s*maxaveragebitrate=\d+", "", line)
                    cleaned = re.sub(r";?\s*stereo=\d+", "", cleaned)
                    cleaned = re.sub(r";?\s*sprop-stereo=\d+", "", cleaned)
                    out_lines.append(
                        f"{cleaned};maxaveragebitrate={bitrate_bps};stereo={stereo_val};sprop-stereo={stereo_val}"
                    )
                else:
                    out_lines.append(line)
                    if not saw_fmtp_96 and re.match(r"^a=rtpmap:96\s+opus/48000", line, re.IGNORECASE):
                        out_lines.append(
                            f"a=fmtp:96 minptime=10;useinbandfec=1;maxaveragebitrate={bitrate_bps};stereo={stereo_val};sprop-stereo={stereo_val}"
                        )
            return "\r\n".join(out_lines) + ("\r\n" if sdp.endswith("\n") else "")
        except Exception:
            return sdp

    async def report_status(self, connected: bool = True, last_error: str = "") -> None:
        if not self.http:
            return
        effective_err = last_error if last_error else self.last_vc_error
        try:
            payload = {
                "connected": connected,
                "sessionName": "parya_userbot",
                "accountName": self.account_name,
                "activeVoiceChatId": self.active_vc_id or "",
                "activeChatGuid": self.active_chat_guid or "",
                "streamingTrack": self.current_track_label,
                "participantCount": 1 if self.active_vc_id else 0,
                "lastError": effective_err,
                "availableGroups": self.available_groups,
            }
            async with self.http.post(
                f"{self.server_url}/api/userbot/status",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=5),
            ):
                pass
        except Exception:
            pass

    async def refresh_groups(self) -> None:
        try:
            chats_res = await self.client.get_chats()
            chats_list = extract_field(chats_res, "chats", []) or []
            groups: List[Dict[str, str]] = []
            for ch in chats_list:
                guid = extract_field(ch, "object_guid", "") or ""
                if not (guid.startswith("g0") or guid.startswith("c0")):
                    continue
                abs_obj = extract_field(ch, "abs_object", None)
                title = (
                    extract_field(abs_obj, "title", "")
                    or extract_field(ch, "title", "")
                    or guid
                )
                uname = str(extract_field(abs_obj, "username", "") or extract_field(ch, "username", "") or "").strip()
                entry: Dict[str, str] = {
                    "chatGuid": guid,
                    "title": str(title),
                    "chatType": "channel" if guid.startswith("c0") else "group",
                }
                if uname:
                    entry["username"] = f"@{uname.lstrip('@')}"
                groups.append(entry)
            if groups:
                self.available_groups = groups[:40]
        except Exception:
            pass

    async def resolve_local_audio(self, stream_url: str) -> str:
        assert self.http is not None
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        resolved = stream_url
        if stream_url.startswith("/"):
            resolved = f"{self.server_url}{stream_url}"
        digest = hashlib.sha1(resolved.encode("utf-8")).hexdigest()[:16]
        ext = ".m4a" if ".m4a" in resolved.lower() else ".webm" if ".webm" in resolved.lower() else ".mp3"
        local_file = CACHE_DIR / f"track_{digest}{ext}"
        if local_file.exists() and local_file.stat().st_size > 2048:
            return str(local_file)

        headers = {"User-Agent": "Mozilla/5.0 ParyaRubikaStreamer/1.0"}
        async with self.http.get(resolved, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"دانلود فایل صوتی ناموفق بود (HTTP {resp.status})")
            data = await resp.read()
            if len(data) < 512:
                raise RuntimeError("فایل صوتی دریافت‌شده خالی است.")
            local_file.write_bytes(data)
            return str(local_file)

    async def _open_media_player(self, local_path: str) -> Any:
        try:
            player = MediaPlayer(local_path, decode=True)
            if getattr(player, "audio", None) is not None:
                return player
        except Exception:
            pass

        # Fallback: normalize/transcode exotic containers via system ffmpeg to 48kHz stereo WAV
        ffmpeg_bin = shutil.which("ffmpeg")
        if not ffmpeg_bin:
            raise RuntimeError("فرمت فایل صوتی قابل رمزگشایی نیست و FFmpeg در دسترس نیست.")
        wav_path = str(pathlib.Path(local_path).with_suffix(".pcm48.wav"))
        if not pathlib.Path(wav_path).exists() or pathlib.Path(wav_path).stat().st_size < 1024:
            proc = await asyncio.create_subprocess_exec(
                ffmpeg_bin,
                "-y",
                "-i",
                local_path,
                "-vn",
                "-ac",
                "2",
                "-ar",
                "48000",
                "-c:a",
                "pcm_s16le",
                wav_path,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr_data = await proc.communicate()
            if proc.returncode != 0:
                err_txt = stderr_data.decode("utf-8", errors="ignore").strip()[-180:]
                raise RuntimeError(f"تبدیل صوتی با FFmpeg ناموفق بود: {err_txt}")
        player = MediaPlayer(wav_path, decode=True)
        if getattr(player, "audio", None) is None:
            raise RuntimeError("جریان صوتی در فایل انتخاب‌شده یافت نشد.")
        return player

    async def speaking_loop(self, chat_guid: str, voice_chat_id: str) -> None:
        while True:
            try:
                is_singing = bool(
                    isinstance(self.audio_track, ControlledAudioTrack)
                    and self.audio_track.is_actively_singing
                )
                if is_singing:
                    await self.client.send_group_voice_chat_activity(chat_guid, voice_chat_id)
                await asyncio.sleep(1.1)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(2.0)

    async def heartbeat_loop(self, chat_guid: str, voice_chat_id: str) -> None:
        while True:
            try:
                try:
                    await self.client.builder(
                        name="getGroupVoiceChatUpdates",
                        input={
                            "chat_guid": chat_guid,
                            "voice_chat_id": voice_chat_id,
                            "state": int(time.time()),
                        },
                    )
                except Exception:
                    await self.client.get_group_voice_chat_updates(chat_guid, voice_chat_id, int(time.time()))
                await asyncio.sleep(9.0)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(4.0)

    async def close_webrtc(self) -> None:
        for task_attr in ("speaking_task", "heartbeat_task"):
            t = getattr(self, task_attr, None)
            if t and not t.done():
                t.cancel()
            setattr(self, task_attr, None)
        if self.player:
            try:
                if getattr(self.player, "audio", None):
                    self.player.audio.stop()
            except Exception:
                pass
            self.player = None
        self.audio_track = None
        if self.pc:
            try:
                await self.pc.close()
            except Exception:
                pass
            self.pc = None
        self.ice_state = "closed"
        self.conn_state = "closed"

    async def ensure_and_stream(
        self,
        chat_guid: str,
        stream_url: Optional[str] = None,
        track_title: str = "",
        track_artist: str = "",
        volume: Optional[int] = None,
    ) -> None:
        if RTCPeerConnection is None or MediaPlayer is None:
            raise RuntimeError("پکیج aiortc یا FFmpeg روی سرور آماده نیست.")

        if volume is not None:
            self.current_volume = max(0, min(100, int(volume)))

        known_guids = {g.get("chatGuid", "") for g in self.available_groups if g.get("chatGuid")}
        is_valid_target = bool(
            chat_guid
            and (chat_guid.startswith("g0") or chat_guid.startswith("c0"))
            and chat_guid != "g0D8xP912RubikaMain"
        )
        if not is_valid_target:
            if self.available_groups:
                chat_guid = self.available_groups[0]["chatGuid"]
            else:
                raise RuntimeError(
                    "شناسه واقعی گروه (g0...) یا کانال (c0...) روبیکا تنظیم نشده است؛ لینک گروه یا آیدی کانال را متصل کنید."
                )
        elif known_guids and chat_guid not in known_guids:
            await self.refresh_groups()

        is_channel = chat_guid.startswith("c0")
        channels = str(self.audio_profile.get("channels") or "stereo")
        normalize = bool(self.audio_profile.get("volumeNormalization", True))

        # If already streaming in the same live voice chat and ICE/Conn is healthy, smoothly swap track!
        if (
            stream_url
            and self.pc is not None
            and self.active_chat_guid == chat_guid
            and self.active_vc_id
            and self.pc.connectionState not in ("failed", "closed", "disconnected")
            and self.pc.iceConnectionState not in ("failed", "closed", "disconnected")
        ):
            local_path = await self.resolve_local_audio(stream_url)
            new_player = await self._open_media_player(local_path)
            new_track = ControlledAudioTrack(
                new_player,
                pts_state=self.rtp_pts_state,
                volume=self.current_volume,
                channels=channels,
                normalize=normalize,
                on_ended=lambda: self.notify_track_ended(track_title),
            )
            sender = next(
                (
                    s
                    for s in self.pc.getSenders()
                    if getattr(s, "track", None) is not None and s.track.kind == "audio"
                ),
                None,
            )
            if sender:
                old_player = self.player
                sender.replaceTrack(new_track)
                self.player = new_player
                self.audio_track = new_track
                self.current_stream_url = stream_url
                self.current_track_title = track_title
                self.current_track_artist = track_artist
                self.last_vc_error = ""
                if old_player and getattr(old_player, "audio", None):
                    try:
                        old_player.audio.stop()
                    except Exception:
                        pass
                try:
                    await self.client.builder(
                        name="setGroupVoiceChatState",
                        input={
                            "chat_guid": chat_guid,
                            "voice_chat_id": self.active_vc_id,
                            "participant_object_guid": getattr(self.client, "guid", None),
                            "action": "Unmute",
                        },
                    )
                except Exception:
                    pass
                self.current_track_label = f"{track_title} — {track_artist}".strip(" —")
                await self.report_status(True, "")
                print(
                    f"[VoiceChat] Swapped track in {chat_guid} ({self.active_vc_id}): {self.current_track_label}",
                    flush=True,
                )
                return

        await self.close_webrtc()
        self.active_vc_id = None
        self.rtp_pts_state = {"pts": 0}
        self.last_vc_error = ""

        # 1) Detect existing group/channel voice chat OR create a new one
        vc_id: Optional[str] = None
        try:
            if is_channel:
                chat_info = await self.client.get_channel_info(chat_guid)
                ch_obj = extract_field(chat_info, "channel", chat_info)
                chat_obj = extract_field(chat_info, "chat", chat_info)
                vc_id = (
                    extract_field(chat_obj, "group_voice_chat_id", None)
                    or extract_field(chat_obj, "channel_voice_chat_id", None)
                    or extract_field(ch_obj, "group_voice_chat_id", None)
                    or extract_field(ch_obj, "channel_voice_chat_id", None)
                    or extract_field(chat_info, "group_voice_chat_id", None)
                )
            else:
                chat_info = await self.client.get_info(chat_guid)
                vc_id = extract_field(getattr(chat_info, "chat", chat_info), "group_voice_chat_id", None)
        except Exception:
            vc_id = None

        if not vc_id:
            try:
                # Rubika uses createGroupVoiceChat for both groups (g0) and channels (c0)
                vc_res = await self.client.create_group_voice_chat(chat_guid)
                vc_id = extract_field(vc_res, "voice_chat_id", None)
                if not vc_id:
                    upd = (
                        extract_field(vc_res, "group_voice_chat_update", None)
                        or extract_field(vc_res, "channel_voice_chat_update", None)
                        or extract_field(vc_res, "voice_chat_update", None)
                    )
                    vc_id = extract_field(upd, "voice_chat_id", None)
            except Exception as exc:
                # Retry get_info in case another admin/participant started it concurrently
                try:
                    if is_channel:
                        chat_info = await self.client.get_channel_info(chat_guid)
                        ch_obj = extract_field(chat_info, "channel", chat_info)
                        chat_obj = extract_field(chat_info, "chat", chat_info)
                        vc_id = (
                            extract_field(chat_obj, "group_voice_chat_id", None)
                            or extract_field(chat_obj, "channel_voice_chat_id", None)
                            or extract_field(ch_obj, "group_voice_chat_id", None)
                            or extract_field(ch_obj, "channel_voice_chat_id", None)
                        )
                    else:
                        chat_info = await self.client.get_info(chat_guid)
                        vc_id = extract_field(getattr(chat_info, "chat", chat_info), "group_voice_chat_id", None)
                except Exception:
                    pass
                if not vc_id:
                    target_fa = "کانال" if is_channel else "گروه"
                    raise RuntimeError(
                        f"امکان ساخت یا دریافت شناسه ویسکال {target_fa} وجود نداشت (اکانت باید ادمین و دارای مجوز ویسکال باشد): {exc}"
                    )

        if not vc_id:
            raise RuntimeError("امکان ساخت یا دریافت شناسه ویسکال روبیکا وجود نداشت (دسترسی ادمین/ویسکال را بررسی کنید).")

        self.active_chat_guid = chat_guid
        self.active_vc_id = str(vc_id)

        # 2) Setup RTCPeerConnection with real STUN configuration & attach diagnostics
        rtc_cfg = self._build_rtc_configuration()
        pc = RTCPeerConnection(configuration=rtc_cfg) if rtc_cfg else RTCPeerConnection()
        self.pc = pc
        self.ice_state = "new"
        self.conn_state = "new"

        @pc.on("iceconnectionstatechange")
        def on_ice_state_change() -> None:
            self.ice_state = pc.iceConnectionState
            print(f"[WebRTC ICE] {chat_guid} -> {self.ice_state}", flush=True)
            if self.ice_state in ("failed", "disconnected"):
                self.last_vc_error = f"وضعیت ICE WebRTC: {self.ice_state}"
                asyncio.create_task(self.report_status(True, self.last_vc_error))
            elif self.ice_state in ("connected", "completed"):
                self.last_vc_error = ""
                asyncio.create_task(self.report_status(True, ""))

        @pc.on("connectionstatechange")
        def on_conn_state_change() -> None:
            self.conn_state = pc.connectionState
            print(f"[WebRTC Conn] {chat_guid} -> {self.conn_state}", flush=True)
            if self.conn_state == "failed":
                self.last_vc_error = "اتصال صوتی WebRTC با سرور روبیکا قطع/ناموفق شد."
                asyncio.create_task(self.report_status(True, self.last_vc_error))
            elif self.conn_state == "connected":
                self.last_vc_error = ""
                asyncio.create_task(self.report_status(True, ""))

        if stream_url:
            local_path = await self.resolve_local_audio(stream_url)
            self.player = await self._open_media_player(local_path)
            self.audio_track = ControlledAudioTrack(
                self.player,
                pts_state=self.rtp_pts_state,
                volume=self.current_volume,
                channels=channels,
                normalize=normalize,
                on_ended=lambda: self.notify_track_ended(track_title),
            )
            pc.addTrack(self.audio_track)
            self.current_stream_url = stream_url
            self.current_track_title = track_title
            self.current_track_artist = track_artist
        else:
            self.player = None
            self.audio_track = SilentPCMTrack(pts_state=self.rtp_pts_state)
            pc.addTrack(self.audio_track)
            self.current_stream_url = None
            self.current_track_title = ""
            self.current_track_artist = ""

        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        # Wait briefly if ICE gathering hasn't finished yet
        for _ in range(15):
            if pc.iceGatheringState == "complete":
                break
            await asyncio.sleep(0.1)

        local_sdp = pc.localDescription.sdp if pc.localDescription else offer.sdp
        tuned_sdp = self._tune_opus_sdp(local_sdp)

        connect_res = None
        sdp_answer = ""
        try:
            connect_res = await self.client.builder(
                name="joinGroupVoiceChat",
                input={
                    "chat_guid": chat_guid,
                    "voice_chat_id": self.active_vc_id,
                    "sdp_offer_data": tuned_sdp,
                    "self_object_guid": getattr(self.client, "guid", None),
                },
            )
            sdp_answer = extract_field(connect_res, "sdp_answer_data", "") or ""
        except Exception as join_err:
            print(f"[VoiceChat] Tuned SDP failed ({join_err}), retrying raw SDP...", flush=True)
            sdp_answer = ""

        if not sdp_answer and tuned_sdp != local_sdp:
            connect_res = await self.client.builder(
                name="joinGroupVoiceChat",
                input={
                    "chat_guid": chat_guid,
                    "voice_chat_id": self.active_vc_id,
                    "sdp_offer_data": local_sdp,
                    "self_object_guid": getattr(self.client, "guid", None),
                },
            )
            sdp_answer = extract_field(connect_res, "sdp_answer_data", "") or ""

        if not sdp_answer:
            raise RuntimeError("پاسخ SDP از سرور ویسکال روبیکا دریافت نشد.")

        try:
            await self.client.builder(
                name="setGroupVoiceChatState",
                input={
                    "chat_guid": chat_guid,
                    "voice_chat_id": self.active_vc_id,
                    "participant_object_guid": getattr(self.client, "guid", None),
                    "action": "Unmute",
                },
            )
        except Exception:
            pass

        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp_answer, type="answer"))

        self.speaking_task = asyncio.create_task(self.speaking_loop(chat_guid, self.active_vc_id))
        self.heartbeat_task = asyncio.create_task(self.heartbeat_loop(chat_guid, self.active_vc_id))

        self.current_track_label = (
            f"{track_title} — {track_artist}".strip(" —")
            if stream_url
            else "ویسکال فعال (آماده پخش)"
        )
        await self.report_status(True, "")
        print(f"[VoiceChat] Active in {chat_guid} ({self.active_vc_id}): {self.current_track_label}", flush=True)

    async def stop_voice_chat(self) -> None:
        await self.close_webrtc()
        if self.active_chat_guid and self.active_vc_id:
            try:
                await self.client.builder(
                    name="discardGroupVoiceChat",
                    input={
                        "chat_guid": self.active_chat_guid,
                        "voice_chat_id": self.active_vc_id,
                    },
                )
            except Exception:
                try:
                    await self.client.builder(
                        name="discardGroupVoiceChat",
                        input={
                            "group_guid": self.active_chat_guid,
                            "voice_chat_id": self.active_vc_id,
                        },
                    )
                except Exception:
                    try:
                        await self.client.leave_group_voice_chat(self.active_chat_guid, self.active_vc_id)
                    except Exception:
                        pass
        self.active_vc_id = None
        self.current_track_label = ""
        self.current_stream_url = None
        self.last_vc_error = ""
        await self.report_status(True, "")

    async def notify_track_ended(self, ended_title: str) -> None:
        if not self.http:
            return
        try:
            async with self.http.post(
                f"{self.server_url}/api/player/ended",
                json={"expectedTitle": ended_title},
                timeout=aiohttp.ClientTimeout(total=5),
            ):
                pass
        except Exception:
            pass

    async def search_itunes(self, query: str) -> Optional[Dict[str, str]]:
        assert self.http is not None
        url = f"https://itunes.apple.com/search?term={quote(query)}&media=music&entity=song&limit=5"
        async with self.http.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 200:
                data = await resp.json(content_type=None)
                for item in data.get("results", []):
                    if item.get("previewUrl"):
                        return {
                            "title": item.get("trackName", query),
                            "artist": item.get("artistName", "ناشناس"),
                            "url": item["previewUrl"],
                        }
        return None

    async def delete_recent_messages(self, chat_guid: str, count: int) -> None:
        if not self.client or not (chat_guid.startswith("g0") or chat_guid.startswith("c0")):
            return
        target_count = max(1, min(200, count))
        try:
            chat_info = (
                await self.client.get_channel_info(chat_guid)
                if chat_guid.startswith("c0")
                else await self.client.get_info(chat_guid)
            )
            last_msg_id = extract_field(extract_field(chat_info, "chat", chat_info), "last_message_id", None)
            msg_ids: List[str] = []
            if last_msg_id:
                try:
                    hist = await self.client.get_messages(
                        chat_guid,
                        max_id=str(last_msg_id),
                        limit=str(min(100, target_count)),
                    )
                except Exception:
                    hist = await self.client.get_messages_interval(
                        chat_guid, middle_message_id=str(last_msg_id)
                    )
                msgs = extract_field(hist, "messages", []) or []
                for m in msgs:
                    mid = extract_field(m, "message_id", None)
                    if mid:
                        msg_ids.append(str(mid))
            if msg_ids:
                for i in range(0, len(msg_ids), 50):
                    await self.client.delete_messages(chat_guid, msg_ids[i : i + 50])
        except Exception as exc:
            print(f"[Userbot DeleteMessages Error] {exc}", file=sys.stderr, flush=True)

    async def report_moderation_event(
        self, chat_guid: str, user_id: str, user_name: str, reason: str, action_taken: str, preview: str = ""
    ) -> None:
        if not self.http:
            return
        try:
            async with self.http.post(
                f"{self.server_url}/api/userbot/moderation-event",
                json={
                    "chatGuid": chat_guid,
                    "userId": user_id,
                    "userName": user_name,
                    "reason": reason,
                    "actionTaken": action_taken,
                    "messagePreview": preview[:80],
                },
                timeout=aiohttp.ClientTimeout(total=5),
            ):
                pass
        except Exception:
            pass

    def record_bot_reply(self, reply_res: Any, chat_guid: str, text: str) -> None:
        try:
            rid = str(
                extract_field(reply_res, "message_id", "")
                or extract_field(extract_field(reply_res, "message_update", None), "message_id", "")
                or ""
            ).strip()
            if rid:
                self.sent_bot_msg_ids.add(rid)
                if len(self.sent_bot_msg_ids) > 400:
                    self.sent_bot_msg_ids = set(list(self.sent_bot_msg_ids)[-250:])
        except Exception:
            pass
        now = time.time()
        fp = f"{chat_guid}::{text.strip()[:80]}"
        self.sent_bot_fingerprints = [
            (k, ts) for (k, ts) in self.sent_bot_fingerprints if now - ts < 15.0
        ]
        self.sent_bot_fingerprints.append((fp, now))

    def is_own_bot_reply(self, chat_guid: str, msg_id: str, text: str) -> bool:
        if msg_id and msg_id in self.sent_bot_msg_ids:
            return True
        now = time.time()
        fp = f"{chat_guid}::{text.strip()[:80]}"
        for k, ts in self.sent_bot_fingerprints:
            if k == fp and now - ts < 15.0:
                return True
        bot_prefixes = (
            "🛡️ کاربر",
            "🛡️ لیست",
            "🛡️ راهنمای",
            "🗑 مقام",
            "⛔ ",
            "⚠️ ",
            "⚠ ",
            "✅ وارد ",
            "✅ مقام",
            "🎶 پخش",
            "📞 گفتگوی",
            "🔐 وضعیت",
            "📊 آمار",
            "🧹 ",
            "🔒 ",
            "🔓 ",
            "🦇 ",
            "📡 گزارش",
            "🤖 بله!",
            "👑 کاربر",
            "👑 پنل",
            "⭐ کاربر",
            "📢 ارسال",
            "🌐 آمار",
            "🔌 وضعیت",
            "💳 اشتراک",
            "📊 سهمیه",
            "🛑 تعداد",
        )
        return any(text.startswith(p) for p in bot_prefixes)

    async def get_user_profile(self, user_guid: str) -> Dict[str, str]:
        uid = (user_guid or "").strip()
        if not uid or not uid.startswith("u0") or not self.client:
            return {"userGuid": uid, "name": uid, "username": ""}
        if uid in self.user_info_cache:
            return self.user_info_cache[uid]
        try:
            res = await self.client.get_user_info(uid)
            u_obj = extract_field(res, "user", None) or extract_field(res, "chat", None) or res
            first = str(extract_field(u_obj, "first_name", "") or "").strip()
            last = str(extract_field(u_obj, "last_name", "") or "").strip()
            uname = str(extract_field(u_obj, "username", "") or "").strip().lstrip("@")
            name = f"{first} {last}".strip() or (f"@{uname}" if uname else uid)
            prof = {
                "userGuid": uid,
                "name": name,
                "username": f"@{uname}" if uname else "",
            }
            if len(self.user_info_cache) > 500:
                self.user_info_cache.clear()
            self.user_info_cache[uid] = prof
            return prof
        except Exception:
            return {"userGuid": uid, "name": uid, "username": ""}

    async def resolve_user_target(self, target_raw: str) -> Dict[str, Any]:
        cleaned = (target_raw or "").strip()
        if not cleaned:
            return {"ok": False, "error": "آیدی یا شناسه کاربر وارد نشده است."}
        if cleaned.startswith("u0"):
            prof = await self.get_user_profile(cleaned)
            return {
                "ok": True,
                "userGuid": prof["userGuid"],
                "name": prof["name"] or cleaned,
                "username": prof["username"],
            }
        uname = cleaned.lstrip("@")
        try:
            obj_res = await self.client.get_object_by_username(uname)
            exist = extract_field(obj_res, "exist", True)
            if exist is False:
                return {"ok": False, "error": f"کاربری با آیدی @{uname} در روبیکا پیدا نشد."}
            u_obj = extract_field(obj_res, "user", None)
            obj_type = str(extract_field(obj_res, "type", "") or "").lower()
            if not u_obj and obj_type != "user":
                return {"ok": False, "error": f"آیدی @{uname} مربوط به یک حساب کاربری نیست."}
            target = u_obj or obj_res
            uid = str(
                extract_field(target, "user_guid", "")
                or extract_field(obj_res, "object_guid", "")
                or ""
            ).strip()
            if not uid or not uid.startswith("u0"):
                return {"ok": False, "error": f"شناسه کاربری @{uname} یافت نشد."}
            first = str(extract_field(target, "first_name", "") or "").strip()
            last = str(extract_field(target, "last_name", "") or "").strip()
            full_name = f"{first} {last}".strip() or f"@{uname}"
            prof = {"userGuid": uid, "name": full_name, "username": f"@{uname}"}
            self.user_info_cache[uid] = prof
            return {"ok": True, **prof}
        except Exception as exc:
            return {"ok": False, "error": f"خطا در جستجوی @{uname}: {exc}"}

    def translate_rubika_admin_error(self, exc: Exception) -> str:
        raw = str(exc)
        upper = raw.upper()
        if "INVALID_AUTH" in upper or "ACCESS" in upper or "PERMISSION" in upper or "NOT_ADMIN" in upper:
            return "اکانت Userbot در این گروه/کانال دسترسی «تنظیم ادمین (SetAdmin)» ندارد. ابتدا این اکانت را مالک یا ادمین با دسترسی تنظیم ادمین کنید."
        if "INVALID_INPUT" in upper or "NOT_FOUND" in upper or "NOT_IN_CHAT" in upper:
            return "کاربر مورد نظر عضو این گروه/کانال نیست یا شناسه او معتبر نیست."
        if "TOO_REQUESTS" in upper or "LIMIT" in upper:
            return "محدودیت موقت سرور روبیکا؛ لطفاً چند ثانیه بعد دوباره تلاش کنید."
        return f"خطا از سرور روبیکا: {raw}"

    async def report_admin_action_result(self, payload: Dict[str, Any]) -> None:
        if not self.http:
            return
        try:
            async with self.http.post(
                f"{self.server_url}/api/userbot/admin-action-result",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=6),
            ):
                pass
        except Exception:
            pass

    async def execute_rubika_admin_action(
        self,
        chat_guid: str,
        target_raw: str,
        admin_action: str,
        task_id: str = "",
        group_id: str = "",
        target_name_hint: str = "",
    ) -> Dict[str, Any]:
        is_promote = admin_action != "UnsetAdmin"
        resolved = await self.resolve_user_target(target_raw)
        if not resolved.get("ok"):
            err = str(resolved.get("error") or "کاربر یافت نشد.")
            res_payload = {
                "taskId": task_id,
                "groupId": group_id,
                "rubikaChatId": chat_guid,
                "targetUserId": target_raw,
                "targetName": target_name_hint or target_raw,
                "adminAction": "SetAdmin" if is_promote else "UnsetAdmin",
                "ok": False,
                "error": err,
            }
            await self.report_admin_action_result(res_payload)
            return res_payload

        uid = str(resolved["userGuid"])
        name = str(resolved.get("name") or target_name_hint or uid)
        username = str(resolved.get("username") or "")

        if uid == getattr(self.client, "guid", ""):
            err = "امکان تغییر دسترسی ادمین روی خود اکانت Userbot وجود ندارد."
            res_payload = {
                "taskId": task_id,
                "groupId": group_id,
                "rubikaChatId": chat_guid,
                "targetUserId": uid,
                "targetUsername": username,
                "targetName": name,
                "adminAction": "SetAdmin" if is_promote else "UnsetAdmin",
                "ok": False,
                "error": err,
            }
            await self.report_admin_action_result(res_payload)
            return res_payload

        ok = False
        err = ""
        try:
            if chat_guid.startswith("g0"):
                if is_promote:
                    full_access = [
                        "ChangeInfo",
                        "PinMessages",
                        "DeleteGlobalAllMessages",
                        "BanMember",
                        "SetJoinLink",
                        "SetMemberAccess",
                        "SetAdmin",
                    ]
                    try:
                        await self.client.set_group_admin(
                            chat_guid, uid, action="SetAdmin", access_list=full_access
                        )
                    except Exception:
                        # Fallback if caller is an admin without permission to grant SetAdmin
                        standard_access = [
                            "ChangeInfo",
                            "PinMessages",
                            "DeleteGlobalAllMessages",
                            "BanMember",
                            "SetJoinLink",
                            "SetMemberAccess",
                        ]
                        await self.client.set_group_admin(
                            chat_guid, uid, action="SetAdmin", access_list=standard_access
                        )
                else:
                    await self.client.set_group_admin(
                        chat_guid, uid, action="UnsetAdmin", access_list=[]
                    )
                ok = True
            elif chat_guid.startswith("c0"):
                if is_promote:
                    try:
                        await self.client.builder(
                            "setChannelAdmin",
                            input={
                                "channel_guid": chat_guid,
                                "member_guid": uid,
                                "action": "SetAdmin",
                                "access_list": [
                                    "ChangeInfo",
                                    "EditMessages",
                                    "DeleteGlobalAllMessages",
                                    "AddMember",
                                    "SetAdmin",
                                ],
                            },
                        )
                    except Exception:
                        await self.client.builder(
                            "setChannelAdmin",
                            input={
                                "channel_guid": chat_guid,
                                "member_guid": uid,
                                "action": "SetAdmin",
                                "access_list": ["ChangeInfo", "AddMember"],
                            },
                        )
                else:
                    await self.client.builder(
                        "setChannelAdmin",
                        input={
                            "channel_guid": chat_guid,
                            "member_guid": uid,
                            "action": "UnsetAdmin",
                            "access_list": [],
                        },
                    )
                ok = True
            else:
                err = "تنظیم ادمین فقط در گروه‌ها و کانال‌های روبیکا قابل اجراست."
        except Exception as exc:
            err = self.translate_rubika_admin_error(exc)
            print(f"[Userbot SetAdmin Error] {exc}", file=sys.stderr, flush=True)

        res_payload = {
            "taskId": task_id,
            "groupId": group_id,
            "rubikaChatId": chat_guid,
            "targetUserId": uid,
            "targetUsername": username,
            "targetName": name,
            "adminAction": "SetAdmin" if is_promote else "UnsetAdmin",
            "ok": ok,
            "error": err,
        }
        await self.report_admin_action_result(res_payload)
        return res_payload

    async def sync_group_members_to_server(
        self, chat_guid: str, task_id: str = "", group_id: str = ""
    ) -> None:
        members: List[Dict[str, str]] = []
        ok = False
        err = ""
        try:
            admin_ids: set[str] = set()
            if chat_guid.startswith("g0"):
                admins_res = await self.client.get_group_admin_members(chat_guid)
                for m in extract_field(admins_res, "in_chat_members", []) or []:
                    m_guid = str(extract_field(m, "member_guid", "") or "").strip()
                    if m_guid:
                        admin_ids.add(m_guid)
                all_res = await self.client.get_group_all_members(chat_guid)
                raw_members = list(extract_field(all_res, "in_chat_members", []) or [])
                seen = set()
                for m in list(extract_field(admins_res, "in_chat_members", []) or []) + raw_members:
                    m_guid = str(extract_field(m, "member_guid", "") or "").strip()
                    if not m_guid or m_guid in seen:
                        continue
                    seen.add(m_guid)
                    first = str(extract_field(m, "first_name", "") or "").strip()
                    last = str(extract_field(m, "last_name", "") or "").strip()
                    uname = str(extract_field(m, "username", "") or "").strip().lstrip("@")
                    name = f"{first} {last}".strip() or (f"@{uname}" if uname else m_guid)
                    members.append({
                        "userId": m_guid,
                        "name": name,
                        "username": f"@{uname}" if uname else "",
                        "role": "admin" if m_guid in admin_ids else "member",
                    })
                ok = True
            elif chat_guid.startswith("c0"):
                admins_res = await self.client.get_channel_admin_members(chat_guid)
                for m in extract_field(admins_res, "in_chat_members", []) or []:
                    m_guid = str(extract_field(m, "member_guid", "") or "").strip()
                    if m_guid:
                        admin_ids.add(m_guid)
                raw_members = []
                try:
                    all_res = await self.client.get_channel_all_members(chat_guid)
                    raw_members = list(extract_field(all_res, "in_chat_members", []) or [])
                except Exception:
                    raw_members = []
                seen = set()
                for m in list(extract_field(admins_res, "in_chat_members", []) or []) + raw_members:
                    m_guid = str(extract_field(m, "member_guid", "") or "").strip()
                    if not m_guid or m_guid in seen:
                        continue
                    seen.add(m_guid)
                    first = str(extract_field(m, "first_name", "") or "").strip()
                    last = str(extract_field(m, "last_name", "") or "").strip()
                    uname = str(extract_field(m, "username", "") or "").strip().lstrip("@")
                    name = f"{first} {last}".strip() or (f"@{uname}" if uname else m_guid)
                    members.append({
                        "userId": m_guid,
                        "name": name,
                        "username": f"@{uname}" if uname else "",
                        "role": "admin" if m_guid in admin_ids else "member",
                    })
                ok = True
            else:
                err = "شناسه چت برای دریافت اعضا معتبر نیست."
        except Exception as exc:
            err = self.translate_rubika_admin_error(exc)
            print(f"[Userbot SyncMembers Error] {exc}", file=sys.stderr, flush=True)

        if self.http:
            try:
                async with self.http.post(
                    f"{self.server_url}/api/userbot/sync-members-result",
                    json={
                        "taskId": task_id,
                        "groupId": group_id,
                        "rubikaChatId": chat_guid,
                        "ok": ok,
                        "members": members[:100],
                        "error": err,
                    },
                    timeout=aiohttp.ClientTimeout(total=8),
                ):
                    pass
            except Exception:
                pass

    async def send_audio_in_chat(
        self, chat_guid: str, stream_url: str, title: str, artist: str
    ) -> None:
        if not self.client or not (chat_guid.startswith("g0") or chat_guid.startswith("c0")):
            return
        try:
            local_path = await self.resolve_local_audio(stream_url)
            caption = f"🎵 {artist} — {title}".strip(" —")
            try:
                await self.client.send_music(chat_guid, local_path, caption=caption)
            except Exception:
                await self.client.send_file(chat_guid, local_path, caption=caption)
        except Exception as exc:
            print(f"[Userbot SendAudio Error] {exc}", file=sys.stderr, flush=True)

    async def poll_bridge_tasks(self) -> None:
        assert self.http is not None
        tick = 0
        while True:
            try:
                async with self.http.get(
                    f"{self.server_url}/api/userbot/next-task",
                    timeout=aiohttp.ClientTimeout(total=6),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if isinstance(data.get("audioProfile"), dict):
                            self.audio_profile = data["audioProfile"]
                        if isinstance(data.get("moderationConfigs"), dict):
                            self.moderation_configs = data["moderationConfigs"]
                        if isinstance(data.get("creatorConfig"), dict):
                            cc = data["creatorConfig"]
                            if cc.get("creatorUsername"):
                                self.creator_username = str(cc["creatorUsername"])
                            if cc.get("creatorRubikaGuid"):
                                self.creator_rubika_guid = str(cc["creatorRubikaGuid"])
                            if isinstance(cc.get("sudoUserIds"), list):
                                self.sudo_user_ids = [str(x) for x in cc["sudoUserIds"]]
                        task = data.get("task")
                        if not task and not self._did_initial_sync:
                            self._did_initial_sync = True
                            snap = data.get("activePlayback")
                            if (
                                isinstance(snap, dict)
                                and (snap.get("voiceCallActive") or snap.get("isPlaying"))
                                and snap.get("rubikaChatId")
                            ):
                                await self.ensure_and_stream(
                                    snap.get("rubikaChatId", ""),
                                    snap.get("streamUrl") if snap.get("isPlaying") else None,
                                    snap.get("trackTitle", ""),
                                    snap.get("trackArtist", ""),
                                    snap.get("volume"),
                                )
                        elif task:
                            self._did_initial_sync = True
                            if isinstance(task.get("audioProfile"), dict):
                                self.audio_profile = task["audioProfile"]
                            action = task.get("action")
                            chat_guid = task.get("rubikaChatId", "")
                            if action == "start_call":
                                await self.ensure_and_stream(
                                    chat_guid,
                                    task.get("streamUrl"),
                                    task.get("trackTitle", ""),
                                    task.get("trackArtist", ""),
                                    task.get("volume"),
                                )
                            elif action in {"play_in_vc", "resume_vc"}:
                                if action == "resume_vc" and self.audio_track and not task.get("streamUrl"):
                                    self.audio_track.resume()
                                else:
                                    await self.ensure_and_stream(
                                        chat_guid,
                                        task.get("streamUrl"),
                                        task.get("trackTitle", ""),
                                        task.get("trackArtist", ""),
                                        task.get("volume"),
                                    )
                            elif action == "set_volume":
                                vol = task.get("volume")
                                if vol is not None:
                                    self.current_volume = max(0, min(100, int(vol)))
                                    if self.audio_track:
                                        self.audio_track.set_volume(self.current_volume)
                            elif action == "set_audio_profile":
                                if self.audio_track:
                                    self.audio_track.set_audio_options(
                                        str(self.audio_profile.get("channels") or "stereo"),
                                        bool(self.audio_profile.get("volumeNormalization", True)),
                                    )
                                if (
                                    self.pc is not None
                                    and self.active_chat_guid
                                    and self.active_vc_id
                                    and self.current_stream_url
                                ):
                                    await self.ensure_and_stream(
                                        self.active_chat_guid,
                                        self.current_stream_url,
                                        self.current_track_title,
                                        self.current_track_artist,
                                        self.current_volume,
                                    )
                            elif action == "pause_vc":
                                if self.audio_track:
                                    self.audio_track.pause()
                            elif action == "mute_vc":
                                if self.audio_track:
                                    self.audio_track.set_muted(True)
                                if self.active_chat_guid and self.active_vc_id:
                                    try:
                                        await self.client.builder(
                                            name="setGroupVoiceChatState",
                                            input={
                                                "chat_guid": self.active_chat_guid,
                                                "voice_chat_id": self.active_vc_id,
                                                "participant_object_guid": getattr(self.client, "guid", None),
                                                "action": "Mute",
                                            },
                                        )
                                    except Exception:
                                        pass
                            elif action == "unmute_vc":
                                if self.audio_track:
                                    self.audio_track.set_muted(False)
                                if self.active_chat_guid and self.active_vc_id:
                                    try:
                                        await self.client.builder(
                                            name="setGroupVoiceChatState",
                                            input={
                                                "chat_guid": self.active_chat_guid,
                                                "voice_chat_id": self.active_vc_id,
                                                "participant_object_guid": getattr(self.client, "guid", None),
                                                "action": "Unmute",
                                            },
                                        )
                                    except Exception:
                                        pass
                            elif action == "stop_vc":
                                await self.stop_voice_chat()
                            elif action == "delete_messages":
                                del_count = int(task.get("deleteCount") or 50)
                                await self.delete_recent_messages(chat_guid, del_count)
                            elif action == "delete_single_message":
                                mid = str(task.get("messageId") or "")
                                if mid and (chat_guid.startswith("g0") or chat_guid.startswith("c0")):
                                    try:
                                        await self.client.delete_messages(chat_guid, [mid], type="Global")
                                    except Exception as exc:
                                        print(f"[Userbot DeleteSingle Error] {exc}", file=sys.stderr, flush=True)
                            elif action == "ban_member":
                                uid = str(task.get("targetUserId") or "")
                                if uid and chat_guid.startswith("g0"):
                                    try:
                                        await self.client.ban_group_member(chat_guid, uid, action="Set")
                                    except Exception as exc:
                                        print(f"[Userbot Ban Error] {exc}", file=sys.stderr, flush=True)
                            elif action == "unban_member":
                                uid = str(task.get("targetUserId") or "")
                                if uid and chat_guid.startswith("g0"):
                                    try:
                                        await self.client.ban_group_member(chat_guid, uid, action="Unset")
                                    except Exception as exc:
                                        print(f"[Userbot Unban Error] {exc}", file=sys.stderr, flush=True)
                            elif action == "pin_message":
                                mid = str(task.get("messageId") or "")
                                if mid and (chat_guid.startswith("g0") or chat_guid.startswith("c0")):
                                    try:
                                        await self.client.set_pin_message(chat_guid, mid, action="Pin")
                                    except Exception as exc:
                                        print(f"[Userbot Pin Error] {exc}", file=sys.stderr, flush=True)
                            elif action == "unpin_message":
                                mid = str(task.get("messageId") or "")
                                if mid and (chat_guid.startswith("g0") or chat_guid.startswith("c0")):
                                    try:
                                        await self.client.set_pin_message(chat_guid, mid, action="Unpin")
                                    except Exception as exc:
                                        print(f"[Userbot Unpin Error] {exc}", file=sys.stderr, flush=True)
                            elif action == "set_group_locks":
                                if chat_guid.startswith("g0"):
                                    lock_chat = bool(task.get("lockChat"))
                                    try:
                                        access_list = [] if lock_chat else ["SendMessages"]
                                        await self.client.set_group_default_access(chat_guid, access_list)
                                    except Exception as exc:
                                        print(f"[Userbot LockChat Error] {exc}", file=sys.stderr, flush=True)
                            elif action == "set_group_admin":
                                uid = str(task.get("targetUserId") or "")
                                admin_act = str(task.get("adminAction") or "SetAdmin")
                                tid = str(task.get("id") or "")
                                gid = str(task.get("groupId") or "")
                                tname = str(task.get("targetName") or "")
                                if uid:
                                    await self.execute_rubika_admin_action(
                                        chat_guid, uid, admin_act, task_id=tid, group_id=gid, target_name_hint=tname
                                    )
                            elif action == "sync_group_members":
                                tid = str(task.get("id") or "")
                                gid = str(task.get("groupId") or "")
                                await self.sync_group_members_to_server(
                                    chat_guid, task_id=tid, group_id=gid
                                )
                            elif action == "join_target":
                                inv = str(task.get("inviteTarget") or "")
                                if inv:
                                    jres = await join_target_with_client(self.client, inv)
                                    if jres.get("ok"):
                                        await self.refresh_groups()
                                        await self.report_status(True, "")
                            elif action == "send_audio_in_chat":
                                s_url = task.get("streamUrl")
                                if s_url:
                                    await self.send_audio_in_chat(
                                        chat_guid,
                                        s_url,
                                        task.get("trackTitle", ""),
                                        task.get("trackArtist", ""),
                                    )
                            elif action == "send_text_message":
                                msg_txt = str(task.get("messageText") or "").strip()
                                if msg_txt and (chat_guid.startswith("g0") or chat_guid.startswith("c0")):
                                    try:
                                        sent = await self.client.send_message(chat_guid, msg_txt)
                                        self.record_bot_reply(sent, chat_guid, msg_txt)
                                    except Exception as exc:
                                        print(f"[Userbot SendText Error] {exc}", file=sys.stderr, flush=True)
                            elif action == "resolve_creator_username":
                                tid = str(task.get("id") or "")
                                target_uname = str(task.get("creatorUsername") or self.creator_username or "@Paria25805")
                                r_res = await self.resolve_user_target(target_uname)
                                if r_res.get("ok") and r_res.get("userGuid"):
                                    self.creator_rubika_guid = str(r_res["userGuid"])
                                if self.http:
                                    try:
                                        async with self.http.post(
                                            f"{self.server_url}/api/userbot/creator-resolved",
                                            json={"taskId": tid, **r_res},
                                            timeout=aiohttp.ClientTimeout(total=6),
                                        ):
                                            pass
                                    except Exception:
                                        pass
                tick += 1
                if tick % 12 == 0:
                    if tick % 60 == 0:
                        await self.refresh_groups()
                    await self.report_status(True)
            except Exception as exc:
                print(f"[Bridge Task Error] {exc}", file=sys.stderr, flush=True)
                await self.report_status(True, str(exc))
            await asyncio.sleep(0.65)

    async def download_reply_file_inline(self, finline: Any) -> Optional[Dict[str, str]]:
        if not finline:
            return None
        try:
            voice_dir = DATA_DIR / "voice-notes"
            voice_dir.mkdir(parents=True, exist_ok=True)
            file_id = str(extract_field(finline, "file_id", "") or int(time.time() * 1000))
            raw_name = str(extract_field(finline, "file_name", "") or "").strip()
            raw_mime = str(extract_field(finline, "mime", "") or "mp3").lower().lstrip(".")
            ext = "mp3"
            for candidate in (raw_name.lower(), raw_mime):
                if "m4a" in candidate or "mp4" in candidate:
                    ext = "m4a"
                    break
                if "ogg" in candidate or "opus" in candidate:
                    ext = "ogg"
                    break
                if "wav" in candidate:
                    ext = "wav"
                    break
                if "aac" in candidate:
                    ext = "aac"
                    break
                if "webm" in candidate:
                    ext = "webm"
                    break
                if "mp3" in candidate or "mpeg" in candidate:
                    ext = "mp3"
                    break
            digest = hashlib.sha1(f"{file_id}_{raw_name}".encode("utf-8")).hexdigest()[:10]
            filename = f"rubika_reply_{digest}.{ext}"
            target_path = voice_dir / filename
            if not target_path.exists() or target_path.stat().st_size < 512:
                await self.client.download(finline, save_as=str(target_path))
            if target_path.exists() and target_path.stat().st_size > 256:
                clean_title = re.sub(r"\.(mp3|m4a|ogg|wav|aac|flac|webm)$", "", raw_name, flags=re.IGNORECASE).strip()
                return {
                    "url": f"/api/voice-notes/{filename}",
                    "title": clean_title or "فایل صوتی گروه روبیکا",
                }
        except Exception as exc:
            print(f"[Userbot Reply Download Error] {exc}", file=sys.stderr, flush=True)
        return None

    async def run(self) -> None:
        if Client is None:
            raise SystemExit("کتابخانه rubpy نصب نیست.")
        if not SESSION_FILE.exists():
            raise SystemExit("سشن Userbot وجود ندارد؛ ابتدا از پنل با شماره موبایل وارد شوید.")

        async with aiohttp.ClientSession() as http:
            self.http = http
            client = Client(name=SESSION_PREFIX, display_welcome=False)
            self.client = client
            try:
                await client.connect()
                if not client.auth or not client.private_key:
                    await self.report_status(False, "سشن Userbot نامعتبر است. لطفاً مجدداً وارد شوید.")
                    return

                client.key = Crypto.passphrase(client.auth)
                client.decode_auth = Crypto.decode_auth(client.auth)
                client.import_key = pkcs1_15.new(RSA.import_key(client.private_key.encode()))
                me = await client.get_me()
                me_user = extract_field(me, "user", None)
                client.guid = extract_field(me_user, "user_guid", "")
                first = extract_field(me_user, "first_name", "") or ""
                last = extract_field(me_user, "last_name", "") or ""
                self.account_name = (
                    f"{first} {last}".strip()
                    or extract_field(me_user, "username", "")
                    or "Rubika Userbot"
                )

                await self.refresh_groups()
                await self.report_status(True, "")
                print(f"[Userbot] Connected as {self.account_name} ({len(self.available_groups)} groups)", flush=True)

                @client.on_message_updates()
                async def on_group_msg(message: Any) -> None:
                    raw_text = (getattr(message, "raw_text", None) or getattr(message, "text", None) or "").strip()
                    text = re.sub(r"^[«»\s]+|[«»\s]+$", "", raw_text).strip()
                    chat_guid = getattr(message, "object_guid", "") or ""
                    if not chat_guid or not (chat_guid.startswith("g0") or chat_guid.startswith("c0") or chat_guid.startswith("u0")):
                        return
                    reply_msg_id = getattr(message, "reply_to_message_id", None)
                    msg_id = str(getattr(message, "message_id", "") or "")
                    author_guid = str(getattr(message, "author_guid", "") or "")
                    is_self_account = bool(
                        author_guid and author_guid == getattr(self.client, "guid", "")
                    )
                    if is_self_account and self.is_own_bot_reply(chat_guid, msg_id, text):
                        return

                    sender_prof = await self.get_user_profile(author_guid) if author_guid else {"name": "", "username": ""}
                    sender_uname = (sender_prof.get("username") or "").strip().lstrip("@").lower()
                    creator_uname_clean = (self.creator_username or "@Paria25805").strip().lstrip("@").lower()
                    is_creator_user = bool(
                        (author_guid and self.creator_rubika_guid and author_guid == self.creator_rubika_guid)
                        or (sender_uname and creator_uname_clean and sender_uname == creator_uname_clean)
                        or (author_guid and author_guid in self.sudo_user_ids)
                        or (sender_uname and any(s.lstrip("@").lower() == sender_uname for s in self.sudo_user_ids))
                    )
                    if is_creator_user and author_guid and sender_uname == creator_uname_clean:
                        self.creator_rubika_guid = author_guid

                    sender_is_rubika_admin = is_self_account or is_creator_user
                    if (chat_guid.startswith("g0") or chat_guid.startswith("c0")) and author_guid and not sender_is_rubika_admin:
                        try:
                            if await self.client.user_is_admin(chat_guid, author_guid):
                                sender_is_rubika_admin = True
                        except Exception:
                            pass

                    # 1) Real-time Helper Admin Moderation Enforcement inside Rubika groups (g0...)
                    if chat_guid.startswith("g0") and msg_id and not is_self_account and not is_creator_user:
                        mod_cfg = self.moderation_configs.get(chat_guid) or {}
                        exempt_ids = set(mod_cfg.get("exemptUserIds") or [])
                        is_exempt = sender_is_rubika_admin or (author_guid in exempt_ids)
                        if not is_exempt:
                            locks = mod_cfg.get("locks") or {}
                            muted_ids = set(mod_cfg.get("mutedUserIds") or [])
                            filtered_words = [str(w).strip().lower() for w in (mod_cfg.get("filteredWords") or []) if str(w).strip()]
                            violation_reason = ""
                            if author_guid in muted_ids:
                                violation_reason = "کاربر در حالت سکوت"
                            elif locks.get("antiForward") and (
                                getattr(message, "forwarded_from", None) is not None
                                or extract_field(message, "forwarded_from", None) is not None
                            ):
                                violation_reason = "ارسال پیام فورواردی (قفل فوروارد)"
                            elif locks.get("antiLink") and text and re.search(
                                r"(https?://\S+|rubika\.ir/\S+|t\.me/\S+|@[A-Za-z0-9_]{4,})", text, re.IGNORECASE
                            ):
                                violation_reason = "ارسال لینک/آیدی غیرمجاز (قفل لینک)"
                            elif filtered_words and text:
                                lower_txt = text.lower()
                                matched_word = next((w for w in filtered_words if w in lower_txt), "")
                                if matched_word:
                                    violation_reason = f"استفاده از کلمه فیلترشده ({matched_word})"
                            elif locks.get("antiSpam") and author_guid:
                                now_ts = time.time()
                                sp_key = f"{chat_guid}:{author_guid}"
                                recent = [t for t in self.spam_tracker.get(sp_key, []) if now_ts - t <= 6.0]
                                recent.append(now_ts)
                                self.spam_tracker[sp_key] = recent[-10:]
                                if len(recent) >= 5:
                                    violation_reason = "ارسال پیام رگباری/اسپم"

                            if violation_reason:
                                try:
                                    await self.client.delete_messages(chat_guid, [msg_id], type="Global")
                                    await self.report_moderation_event(
                                        chat_guid,
                                        author_guid or "unknown",
                                        f"کاربر ({author_guid[:8]})" if author_guid else "کاربر روبیکا",
                                        violation_reason,
                                        "حذف خودکار پیام توسط مدیر کمکی",
                                        text,
                                    )
                                except Exception:
                                    pass
                                return

                    if not text:
                        return

                    # 2) Direct PV (u0...) invite link or channel ID -> join + create VC + join VC + play music
                    if chat_guid.startswith("u0"):
                        m_url_or_at = re.search(
                            r"(?:https?://)?rubika\.ir/(?:joing|joinc)/[A-Za-z0-9_\-]+|(?:https?://)?rubika\.ir/[A-Za-z0-9_]{3,}|@[A-Za-z0-9_]{3,}|\b(?:c0|g0)[A-Za-z0-9]{15,}\b",
                            text,
                            re.IGNORECASE,
                        )
                        if m_url_or_at:
                            target_arg = m_url_or_at.group(0).strip()
                            # Extract optional song query if user typed e.g. "پخش آهنگ تتلو @Pari92i29mmm"
                            song_query = ""
                            without_target = (text[:m_url_or_at.start()] + " " + text[m_url_or_at.end():]).strip()
                            without_target = re.sub(
                                r"^(?:ورود\s*موزیک|ورود\s*بات|ورود\s*کمکی|ورود\s*گروه|ورود\s*کانال|عضویت\s*کانال|کال(?:\s+بزار|\s+بذار|\s+بزن)?|ویسکال|شروع\s*ویسکال|ساخت\s*کال|پخش\s*آهنگ|پخش\s*موزیک|پخش|در|تو|داخل|به)\b",
                                "",
                                without_target,
                            ).strip()
                            if len(without_target) >= 2 and not re.match(r"^(?:در|تو|داخل|بزار|بذار|بزن|بخوان|بخون)$", without_target):
                                song_query = without_target

                            jres = await join_target_with_client(self.client, target_arg)
                            if jres.get("ok"):
                                await self.refresh_groups()
                                await self.report_status(True, "")
                                track_info: Dict[str, Any] = {}
                                try:
                                    if self.http:
                                        async with self.http.post(
                                            f"{self.server_url}/api/userbot/bind-group",
                                            json={
                                                "chatGuid": jres.get("chatGuid"),
                                                "chatType": jres.get("chatType", "group"),
                                                "username": jres.get("username", ""),
                                                "title": jres.get("title", "گروه/کانال روبیکا"),
                                                "inviteLink": jres.get("inviteLink", target_arg),
                                                "autoPlayInCall": True,
                                                **({"songQuery": song_query} if song_query else {}),
                                            },
                                            timeout=aiohttp.ClientTimeout(total=12),
                                        ) as bind_resp:
                                            if bind_resp.status == 200:
                                                bind_data = await bind_resp.json()
                                                track_info = bind_data.get("track") or {}
                                except Exception:
                                    pass
                                kind_fa = "کانال" if jres.get("chatType") == "channel" else "گروه"
                                t_title = track_info.get("title") or ""
                                t_artist = track_info.get("artist") or ""
                                song_line = (
                                    f"🎶 در حال پخش در ویسکال: {t_artist} — {t_title}".strip(" —")
                                    if t_title
                                    else "🎶 ویسکال فعال و آماده پخش آهنگ شد."
                                )
                                try:
                                    await message.reply(
                                        f"✅ وارد {kind_fa} «{jres.get('title')}» شدم و ویسکال را باز کردم!\n🆔 شناسه: {jres.get('chatGuid')}\n{song_line}"
                                    )
                                except Exception:
                                    pass
                            else:
                                try:
                                    await message.reply(f"⚠️ {jres.get('error', 'خطا در عضویت.')}")
                                except Exception:
                                    pass
                            return

                    reply_play_cmds = {
                        "پخش",
                        "پخش کن",
                        "اینو پخش کن",
                        "پخش ریپلای",
                        "پخش در ویسکال",
                        "پخش تو ویسکال",
                        "پخش ویسکال",
                        "پخش آهنگ",
                        "پخش موزیک",
                        "بخوان",
                        "بخون",
                        "پخش فوری",
                        "اضافه به صف",
                        "افزودن به صف",
                        "به صف",
                        "play",
                    }
                    has_inline_target = bool(
                        re.search(r"(?:https?://)?rubika\.ir/(?:joing/|joinc/|[A-Za-z0-9_]{3,})", text, re.IGNORECASE)
                        or re.match(r"^(?:کال(?:\s+بزار|\s+بذار|\s+بزن)?|ویسکال|شروع\s*ویسکال|ساخت\s*کال)\s+@[A-Za-z0-9_]{3,}", text)
                        or re.match(r"^(?:پخش(?:\s+آهنگ|\s+موزیک)?)\s+.*@[A-Za-z0-9_]{3,}", text)
                    )
                    is_music_cmd = bool(
                        has_inline_target
                        or re.match(r"^@[A-Za-z0-9_]{4,}$", text)
                        or re.match(r"^(پخش آهنگ|پخش موزیک|دانلود آهنگ|دانلود موزیک|دانلود|آهنگ|موزیک|پخش)(\s+.+)?$", text)
                        or re.match(r"^(حذف|حذف پیام|حذف پیام‌ها|حذف پیامها|پاکسازی)(\s+[0-9۰-۹٠-٩]+)?$", text)
                        or re.match(r"^(ورود\s*موزیک|ورود\s*بات|ورود\s*کمکی|ورود\s*گروه|ورود\s*کانال|عضویت\s*کانال|کال\s*کانال|ویسکال\s*کانال|پخش\s*در\s*کانال|پخش\s*تو\s*کانال)\s+.+$", text, re.DOTALL)
                        or re.match(r"^(ساخت پلی[‌ ]?لیست|ایجاد پلی[‌ ]?لیست|پلی[‌ ]?لیست جدید|افزودن به پلی[‌ ]?لیست|اضافه به پلی[‌ ]?لیست|پخش پلی[‌ ]?لیست|مشاهده پلی[‌ ]?لیست|نمایش پلی[‌ ]?لیست|حذف پلی[‌ ]?لیست|تغییر نام پلی[‌ ]?لیست|حذف از پلی[‌ ]?لیست)\b", text)
                        or re.match(r"^(فیلتر|حذف فیلتر)\s+.+$", text)
                        or re.match(r"^(تنظیم\s*ادمین|تنظیم\s*مدیر|ادمین\s*کردن|مدیر\s*کردن|ارتقا\s*به\s*(?:مدیر|ادمین)|حذف\s*ادمین|حذف\s*مدیر|عزل\s*(?:ادمین|مدیر)|برکناری\s*(?:ادمین|مدیر))(?:\s+.+)?$", text)
                        or re.match(r"^(تمدید\s*اشتراک|تنظیم\s*سهمیه|ارسال\s*همگانی|افزودن\s*سودو|حذف\s*سودو)\s+.+$", text, re.DOTALL)
                        or text in {"ادمین", "مدیر", "پنل سازنده", "پنل", "دستورات سازنده", "منوی سازنده", "ربات خاموش", "خاموش کردن ربات", "حالت تعمیرات", "ربات روشن", "روشن کردن ربات", "اشتراک نامحدود", "سهمیه نامحدود", "قطع همه ویسکال ها", "قطع همه کال ها", "قطع همه ویسکال‌ها", "آمار کل"}
                        or text in reply_play_cmds
                        or text
                        in {
                            "بعدی",
                            "قبلی",
                            "توقف آهنگ",
                            "قطع آهنگ",
                            "قطع موزیک",
                            "ادامه آهنگ",
                            "قطع ویسکال",
                            "قطع کال",
                            "ساخت کال",
                            "ویسکال",
                            "باز کردن ویسکال",
                            "باز کن ویسکال",
                            "شروع ویسکال",
                            "ویس چت",
                            "ویس‌چت",
                            "کال",
                            "پیوستن به ویسکال",
                            "#موزیکال",
                            "موزیکال",
                            "دستور جدید بتمن",
                            "دستورات بتمن",
                            "بتمن",
                            "پلی‌لیست‌ها",
                            "پلی لیست ها",
                            "پلی‌لیست ها",
                            "لیست پلی‌لیست",
                            "Kill",
                            "Kill ⚔️",
                            "خروج",
                            "پخش رندوم",
                            "پخش رندوم شاد",
                            "پخش رندوم غمگین",
                            "موزیک ملایم",
                            "استراحت",
                            "صف",
                            "صف پخش",
                            "تاریخچه آهنگها",
                            "تاریخچه آهنگ‌ها",
                            "سکوت",
                            "حذف سکوت",
                            "لغو سکوت",
                            "اخطار",
                            "حذف اخطار",
                            "پاک کردن اخطارها",
                            "تخلفات",
                            "بن",
                            "اخراج",
                            "ریمو",
                            "آنبن",
                            "رفع مسدودی",
                            "آزاد",
                            "پین",
                            "سنجاق",
                            "حذف پین",
                            "برداشتن پین",
                            "لغو سنجاق",
                            "قفل لینک",
                            "باز کردن لینک",
                            "لینک قفل",
                            "لینک باز",
                            "قفل فوروارد",
                            "باز کردن فوروارد",
                            "فوروارد قفل",
                            "فوروارد باز",
                            "قفل اسپم",
                            "ضد اسپم",
                            "باز کردن اسپم",
                            "اسپم باز",
                            "قفل گروه",
                            "قفل چت",
                            "باز کردن گروه",
                            "گروه باز",
                            "قفل‌ها",
                            "قفل ها",
                            "مدیران",
                            "نصب",
                            "پاکسازی",
                            "آمار",
                            "تنظیم مالک",
                            "تنظیم ادمین",
                            "حذف ادمین",
                            "ویژه",
                            "حذف ویژه",
                            "دسترسی عموم باز",
                            "دسترسی عموم قفل باشد",
                            "دسترسی عموم قفل",
                        }
                    )
                    if not is_music_cmd:
                        return

                    # Extract reply audio/text/sender OR captioned audio directly on this message
                    reply_url = None
                    reply_title = None
                    reply_sender_id = None
                    if reply_msg_id:
                        try:
                            replied = await self.client.get_messages_by_id(chat_guid, [reply_msg_id])
                            msgs = extract_field(replied, "messages", []) or []
                            if msgs:
                                rm = msgs[0]
                                reply_sender_id = str(extract_field(rm, "author_object_guid", "") or "") or None
                                rm_text = str(extract_field(rm, "text", "") or "")
                                url_m = re.search(r"https?://\S+", rm_text)
                                if url_m:
                                    reply_url = url_m.group(0)
                                finline = extract_field(rm, "file_inline", None)
                                if finline:
                                    reply_title = str(extract_field(finline, "file_name", "") or "").strip() or None
                                    downloaded = await self.download_reply_file_inline(finline)
                                    if downloaded:
                                        reply_url = downloaded["url"]
                                        reply_title = downloaded["title"]
                        except Exception:
                            pass

                    if not reply_url:
                        self_finline = extract_field(message, "file_inline", None)
                        if self_finline:
                            reply_title = str(extract_field(self_finline, "file_name", "") or "").strip() or None
                            downloaded = await self.download_reply_file_inline(self_finline)
                            if downloaded:
                                reply_url = downloaded["url"]
                                reply_title = downloaded["title"]

                    # Route through Node engine with message_id deduplication so panel, VC, and group stay in sync
                    reply_prof = await self.get_user_profile(reply_sender_id) if reply_sender_id else {"name": ""}
                    try:
                        if self.http:
                            async with self.http.post(
                                f"{self.server_url}/api/userbot/incoming-message",
                                json={
                                    "chatGuid": chat_guid,
                                    "messageId": msg_id,
                                    "senderId": author_guid or None,
                                    **({"senderName": sender_prof.get("name")} if sender_prof.get("name") else {}),
                                    **({"senderUsername": sender_prof.get("username")} if sender_prof.get("username") else {}),
                                    "senderIsAdmin": sender_is_rubika_admin,
                                    "isSelfAccount": is_self_account,
                                    "deferAdminExec": True,
                                    "text": text,
                                    **({"replyToMessageId": str(reply_msg_id)} if reply_msg_id else {}),
                                    **({"replyToSenderId": reply_sender_id} if reply_sender_id else {}),
                                    **({"replyToSenderName": reply_prof.get("name")} if reply_prof.get("name") else {}),
                                    **({"replyToAudioUrl": reply_url} if reply_url else {}),
                                    **({"replyToTitle": reply_title} if reply_title else {}),
                                },
                                timeout=aiohttp.ClientTimeout(total=15),
                            ) as cmd_resp:
                                if cmd_resp.status == 200:
                                    cmd_data = await cmd_resp.json()
                                    if cmd_data.get("duplicate"):
                                        return
                                    deferred_admin = cmd_data.get("deferredAdminAction")
                                    if isinstance(deferred_admin, dict):
                                        act_res = await self.execute_rubika_admin_action(
                                            str(deferred_admin.get("rubikaChatId") or chat_guid),
                                            str(deferred_admin.get("targetUserId") or ""),
                                            str(deferred_admin.get("adminAction") or "SetAdmin"),
                                            target_name_hint=str(deferred_admin.get("targetName") or ""),
                                        )
                                        if act_res.get("ok"):
                                            is_promote_res = act_res.get("adminAction") == "SetAdmin"
                                            t_label = act_res.get("targetName") or act_res.get("targetUserId")
                                            final_reply = (
                                                f"🛡️ کاربر «{t_label}» در روبیکا به عنوان ادمین/مدیر تنظیم شد ✅"
                                                if is_promote_res
                                                else f"🗑 مقام مدیر/ادمین کاربر «{t_label}» در روبیکا برداشته شد."
                                            )
                                        else:
                                            final_reply = f"⚠️ {act_res.get('error') or 'خطا در تنظیم ادمین در روبیکا.'}"
                                        try:
                                            r_obj = await message.reply(final_reply)
                                            self.record_bot_reply(r_obj, chat_guid, final_reply)
                                        except Exception:
                                            pass
                                        return
                                    bot_msg = (cmd_data.get("botMessage") or {}).get("text", "")
                                    if bot_msg:
                                        try:
                                            r_obj = await message.reply(bot_msg)
                                            self.record_bot_reply(r_obj, chat_guid, bot_msg)
                                        except Exception:
                                            pass
                                    return
                    except Exception:
                        pass

                    # Direct fallback if panel backend is unavailable
                    if reply_url and text in reply_play_cmds:
                        title_label = reply_title or "فایل صوتی ریپلای‌شده"
                        today_key = f"{chat_guid}:{datetime.now().strftime('%Y-%m-%d')}"
                        self.daily_counts[today_key] = self.daily_counts.get(today_key, 0) + 1
                        cnt = self.daily_counts[today_key]
                        try:
                            await message.reply(
                                f"🎶 پخش آغاز شد\n🎵 گروه روبیکا   {title_label}\n📊 سهمیه امروز: {cnt}/10"
                            )
                        except Exception:
                            pass
                        await self.ensure_and_stream(chat_guid, reply_url, title_label, "گروه روبیکا")
                        return

                    play_m = re.match(r"^(پخش آهنگ|پخش موزیک|آهنگ|موزیک|پخش)\s+(.+)$", text)
                    if play_m:
                        q = play_m.group(2).strip()
                        track = await self.search_itunes(q)
                        if not track:
                            return
                        today_key = f"{chat_guid}:{datetime.now().strftime('%Y-%m-%d')}"
                        self.daily_counts[today_key] = self.daily_counts.get(today_key, 0) + 1
                        cnt = self.daily_counts[today_key]
                        try:
                            await message.reply(
                                f"🎶 پخش آغاز شد\n🎵 {track['artist']}   {track['title']}\n📊 سهمیه امروز: {cnt}/10"
                            )
                        except Exception:
                            pass
                        await self.ensure_and_stream(chat_guid, track["url"], track["title"], track["artist"])
                    elif text in {"ویسکال", "باز کردن ویسکال", "باز کن ویسکال", "شروع ویسکال", "ساخت کال", "ویس چت", "ویس‌چت", "کال"}:
                        await self.ensure_and_stream(chat_guid, None)
                        try:
                            await message.reply("📞 گفتگوی گروهی (ویسکال) در گروه باز شد. برای پیوستن روی تماس بالای گپ بزنید.")
                        except Exception:
                            pass
                    elif text in {"قطع ویسکال", "Kill", "Kill ⚔️", "خروج"}:
                        await self.stop_voice_chat()

                bridge_task = asyncio.create_task(self.poll_bridge_tasks())
                try:
                    await client.get_updates()
                finally:
                    bridge_task.cancel()
                    await self.stop_voice_chat()
                    await self.report_status(False, "")
            except Exception as exc:
                await self.report_status(False, f"خطای اتصال Userbot: {exc}")
                print(f"[Userbot Error] {exc}", file=sys.stderr, flush=True)
            finally:
                await close_client_safely(client)


def main() -> None:
    parser = argparse.ArgumentParser(description="Rubika Built-in Userbot Voice Chat Daemon")
    parser.add_argument("--mode", choices=["status", "send-code", "sign-in", "join-group", "logout", "run"], required=True)
    parser.add_argument("--server", default="http://127.0.0.1:3000")
    parser.add_argument("--phone", default="")
    parser.add_argument("--pass-key", default="")
    parser.add_argument("--code", default="")
    parser.add_argument("--hash", default="")
    parser.add_argument("--link", default="")
    args = parser.parse_args()

    if args.mode == "status":
        res = asyncio.run(cmd_status())
        print(json.dumps(res, ensure_ascii=False))
    elif args.mode == "send-code":
        res = asyncio.run(cmd_send_code(args.phone, args.pass_key))
        print(json.dumps(res, ensure_ascii=False))
    elif args.mode == "sign-in":
        res = asyncio.run(cmd_sign_in(args.phone, args.code, args.hash))
        print(json.dumps(res, ensure_ascii=False))
    elif args.mode == "join-group":
        res = asyncio.run(cmd_join_group(args.link))
        print(json.dumps(res, ensure_ascii=False))
    elif args.mode == "logout":
        if SESSION_FILE.exists():
            SESSION_FILE.unlink()
        print(json.dumps({"ok": True}))
    elif args.mode == "run":
        asyncio.run(RubikaLiveDaemon(args.server).run())


if __name__ == "__main__":
    main()
