"""
Base API client for HTTP requests with common error handling.
"""

import requests
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class APIClient:
    """Base class for API clients with common HTTP request methods."""

    def __init__(self, base_url: str, api_key: str, name: str = "API"):
        """
        Initialize API client.

        Args:
            base_url: Base URL for the API
            api_key: API key for authentication
            name: Name of the service (for logging)
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.name = name

    def _request(self, method: str, endpoint: str, **kwargs) -> Optional[Any]:
        """
        Make HTTP request with common error handling.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint (without base URL)
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful, None otherwise
        """
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = kwargs.pop('headers', {})
        headers['X-Api-Key'] = self.api_key

        try:
            response = requests.request(method, url, headers=headers, timeout=30, **kwargs)
            response.raise_for_status()
            return response.json() if response.text else {}
        except requests.exceptions.HTTPError as e:
            logger.error(f"[{self.name}] HTTP error for {method} {endpoint}: {e}")
            if e.response is not None:
                logger.error(f"[{self.name}] Response: {e.response.text}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"[{self.name}] Request failed for {method} {endpoint}: {e}")
            return None
        except Exception as e:
            logger.error(f"[{self.name}] Unexpected error for {method} {endpoint}: {e}")
            return None

    def _get(self, endpoint: str, **kwargs) -> Optional[Any]:
        """
        Make GET request.

        Args:
            endpoint: API endpoint
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful, None otherwise
        """
        return self._request('GET', endpoint, **kwargs)

    def _post(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> Optional[Any]:
        """
        Make POST request.

        Args:
            endpoint: API endpoint
            data: JSON data to send
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful, None otherwise
        """
        return self._request('POST', endpoint, json=data, **kwargs)

    def _put(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> Optional[Any]:
        """
        Make PUT request.

        Args:
            endpoint: API endpoint
            data: JSON data to send
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful, None otherwise
        """
        return self._request('PUT', endpoint, json=data, **kwargs)

    def _delete(self, endpoint: str, **kwargs) -> Optional[Any]:
        """
        Make DELETE request.

        Args:
            endpoint: API endpoint
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response JSON if successful, None otherwise
        """
        return self._request('DELETE', endpoint, **kwargs)
