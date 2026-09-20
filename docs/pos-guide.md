# POS guide

1. Sign in as an OWNER, MANAGER or CASHIER with `pos.use`.
2. Select the operating branch in the top bar.
3. Open a register shift and enter the physical opening float.
4. Open **POS**, search or filter products, and select a product.
5. Choose all required modifiers. POS uses the same product/modifier records and authoritative pricing RPC as the website.
6. Adjust quantity, add optional customer details or an order note, and enter cash received. **Exact cash** fills the order total.
7. Use **Hold** when service is interrupted; held orders are private to the cashier and can be resumed.
8. Complete the sale. The server creates the order, paid cash transaction and collision-safe daily token in one controlled flow. Print the generated receipt from the browser dialog.

The initial operational mode is counter/takeaway and cash. Online/card buttons stay unavailable until a verified gateway adapter is configured. A sale cannot be completed without an open shift, valid products/modifiers, and enough cash received.
