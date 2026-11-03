"""Listening tasks: what an uploaded audio file really is.

The browser's file name and content type are not trusted — the first bytes decide. Only plain audio
gets in (MP3, M4A/AAC, OGG, WAV) and it is stored under a random name with the extension of what it
really is, so nothing else (a page, a script, a video) can ever be served from /media as "audio".
"""
import struct
import uuid

from django.core.exceptions import ValidationError

MAX_AUDIO_MB = 15
MAX_AUDIO_BYTES = MAX_AUDIO_MB * 1024 * 1024

MSG_VIDEO = 'Bu video faylıdır. Dinləmə üçün audio fayl lazımdır (MP3, M4A). Videonun səsini MP3-ə çevirib yükləyin.'
MSG_NOT_AUDIO = 'Bu fayl audio deyil. MP3, M4A, OGG və ya WAV faylı yükləyin.'
MSG_TOO_BIG = f'Audio faylı {MAX_AUDIO_MB} MB-dan böyük ola bilməz.'
MSG_EMPTY = 'Audio faylı boşdur.'

# Container brands of MP4 files that are audio-only by definition
_M4A_BRANDS = {b'M4A ', b'M4B ', b'M4P ', b'F4A ', b'F4B '}


def _mp4_track_kinds(data):
    """Handler types ('soun', 'vide', …) of every track in an MP4/MOV container."""
    kinds = set()

    def walk(start, end, depth):
        pos = start
        while pos + 8 <= end and depth < 8:
            size, kind = struct.unpack('>I4s', data[pos:pos + 8])
            header = 8
            if size == 1 and pos + 16 <= end:                 # 64-bit box size
                size = struct.unpack('>Q', data[pos + 8:pos + 16])[0]
                header = 16
            elif size == 0:                                   # box runs to the end of the file
                size = end - pos
            if size < header or pos + size > end:
                return
            body = pos + header
            if kind in (b'moov', b'trak', b'mdia'):
                walk(body, pos + size, depth + 1)
            elif kind == b'hdlr' and body + 12 <= pos + size:
                kinds.add(data[body + 8:body + 12].decode('latin-1'))
            pos += size

    walk(0, len(data), 0)
    return kinds


def _mp3_frame(data, at=0):
    """An MPEG audio frame header (11 sync bits, a valid layer and bitrate) at `at`."""
    if len(data) < at + 4 or data[at] != 0xFF or data[at + 1] & 0xE0 != 0xE0:
        return False
    layer = (data[at + 1] >> 1) & 0x3
    bitrate = data[at + 2] >> 4
    rate = (data[at + 2] >> 2) & 0x3
    return layer != 0 and bitrate not in (0, 0xF) and rate != 0x3


def detect_audio(data):
    """The file's real kind ('mp3', 'm4a', 'aac', 'ogg', 'wav'), or ValidationError with a message
    a teacher understands (e.g. that a video was chosen)."""
    head = data[:64]
    if not head:
        raise ValidationError(MSG_EMPTY)
    if head.startswith(b'ID3'):                                # MP3 with ID3 tags
        return 'mp3'
    if head[:4] == b'RIFF' and head[8:12] == b'WAVE':
        return 'wav'
    if head[:4] == b'RIFF' and head[8:11] == b'AVI':
        raise ValidationError(MSG_VIDEO)
    if head.startswith(b'OggS'):
        if b'theora' in data[:4096].lower():                   # Ogg video
            raise ValidationError(MSG_VIDEO)
        return 'ogg'
    if head[4:8] == b'ftyp':                                    # MP4 family: M4A audio, or MP4/MOV video
        kinds = _mp4_track_kinds(data)
        if 'vide' in kinds:
            raise ValidationError(MSG_VIDEO)
        if 'soun' in kinds or head[8:12] in _M4A_BRANDS:
            return 'm4a'
        raise ValidationError(MSG_NOT_AUDIO)
    if head.startswith(b'\x1a\x45\xdf\xa3'):                    # WebM / MKV — almost always a video
        raise ValidationError(MSG_VIDEO)
    if head[:2] == b'\xff\xf1' or head[:2] == b'\xff\xf9':      # raw AAC (ADTS)
        return 'aac'
    if _mp3_frame(data) and (len(data) < 4096 or _mp3_frame_follows(data)):
        return 'mp3'
    raise ValidationError(MSG_NOT_AUDIO)


def _mp3_frame_follows(data):
    """A bare MPEG stream: a second frame header somewhere close after the first (rules out
    random bytes that happen to start with 0xFFE)."""
    return any(_mp3_frame(data, i) for i in range(4, min(len(data) - 4, 4096)))


def clean_audio_upload(upload):
    """Check an uploaded audio file and give it a random name with its real extension."""
    if upload.size > MAX_AUDIO_BYTES:
        raise ValidationError(MSG_TOO_BIG)
    upload.seek(0)
    data = upload.read()
    upload.seek(0)
    kind = detect_audio(data)
    upload.name = f'{uuid.uuid4().hex}.{kind}'
    return upload
