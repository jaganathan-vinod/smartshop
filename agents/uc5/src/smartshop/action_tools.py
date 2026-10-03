def propose_stock_change(product_id: str, quantity_delta: int, approved: bool, reason: str) -> dict:
    """Propose a stock quantity change. The change is refused until an operator approves it.

    Args:
        product_id: Catalogue product id.
        quantity_delta: Units to add. Negative removes units.
        approved: True only after the operator has approved this exact change.
        reason: Why the stock should change.
    """
    if not approved:
        return {
            "status": "NEEDS_APPROVAL",
            "productId": product_id,
            "quantityDelta": quantity_delta,
            "reason": reason,
        }
    return {
        "status": "APPROVED_NOT_WRITTEN",
        "productId": product_id,
        "quantityDelta": quantity_delta,
        "reason": reason,
        "detail": "Stock stays in the SmartShop order APIs. This agent does not write DynamoDB.",
    }
