FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TEMP_STORAGE_PATH=/tmp/corrige-plus

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN addgroup --system corrige && adduser --system --ingroup corrige corrige \
    && mkdir -p /tmp/corrige-plus \
    && chown -R corrige:corrige /tmp/corrige-plus /app

USER corrige

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
