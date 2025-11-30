FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Upgrade pip to fix CVE-2025-8869
RUN pip install --upgrade pip>=25.3

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY *.py .

# Make script executable
RUN chmod +x arr-language-tagger.py

# Create config directory
RUN mkdir -p /config

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV CONFIG_PATH=/config/config.yml
ENV RUN_MODE=schedule

# Run application
CMD ["python", "-u", "arr-language-tagger.py"]
