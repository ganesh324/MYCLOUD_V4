FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MYCLOUD_BACKEND_HOST=0.0.0.0 \
    MYCLOUD_BACKEND_PORT=8000

WORKDIR /app/backend

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host \"$MYCLOUD_BACKEND_HOST\" --port \"$MYCLOUD_BACKEND_PORT\""]
