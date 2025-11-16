# Security Policy

## Supported Versions

We support the latest version of Langarr. Security updates will be applied to the main branch.

| Version | Supported          |
| ------- | ------------------ |
| latest (main) | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Langarr, please report it responsibly:

1. **DO NOT** open a public issue
2. Email the maintainer or use GitHub's private vulnerability reporting
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

We will respond to security reports within 48 hours and work to release a fix as soon as possible.

## Security Considerations

### API Keys
- Never commit `.env` files containing real API keys
- Store credentials securely using environment variables
- Rotate API keys if accidentally exposed

### Docker Security
- Langarr containers run with user-specified PUID/PGID
- No privileged access required
- Network isolation via Docker networks

### Dependencies
- Recyclarr: Official image from [ghcr.io/recyclarr/recyclarr](https://github.com/recyclarr/recyclarr)
- Python dependencies: Specified in `requirements.txt`

## Best Practices

1. Keep Docker images updated
2. Use strong, unique API keys
3. Restrict network access to trusted containers only
4. Monitor logs for suspicious activity
5. Follow principle of least privilege for PUID/PGID
