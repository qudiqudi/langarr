"""
Shared constants for Langarr application.
"""

# Special token for testing mode (not a real secret)
# This token is used when ALLOW_INSECURE_WEBHOOK=true is set for testing purposes
INSECURE_BYPASS_TOKEN = "INSECURE_BYPASS"

# Results of ArrInstance.dispatch_search (the webhook retries SEARCH_FAILED)
SEARCH_SENT = 'sent'
SEARCH_SKIPPED = 'skipped'
SEARCH_FAILED = 'failed'
