# POS guide

1. Sign in as an OWNER, MANAGER or CASHIER with `pos.use`.
2. Select the operating branch in the top bar.
3. Open a register shift and enter the physical opening float.
4. Open **POS**, search or filter products, and select a product.
5. Choose all required modifiers. POS uses the same product/modifier records and authoritative pricing RPC as the website.
6. Adjust quantity, add customer details or an order note, choose the supported order mode, then open **Checkout**. **Exact cash** fills the cash amount. Delivery requires contact, a branch delivery area, address and confirmed distance; dine-in requires an available branch table.
7. Use **Hold** when service is interrupted; held orders are private to the cashier and can be resumed.
8. Complete the sale. The server creates the order, paid cash transaction and collision-safe daily token in one controlled flow. Print the generated receipt from the browser dialog.

The initial operational mode is counter/takeaway and cash. Only active canonical POS payment methods appear. Configured manual card/terminal tenders record an externally collected payment with its required reference; they do not charge an online gateway. A cash sale cannot complete without an open shift, valid products/modifiers, and enough cash received.

## Fast operation and recovery

- `/` focuses product search when no dialog is open. `Esc` closes dialogs. Closing the receipt returns focus to search for the next order.
- Initial unknown content has a structured skeleton. Category changes, quantities and background refresh do not replace the whole counter with a loader.
- **Table payments** shows the number of unpaid QR/waiter bills without shifting the catalog when a new bill arrives. Expand it to collect payment. Do not collect cash twice after an uncertain response: retry the same bill.
- The current cart and exact pending sale request are saved in session storage, scoped to staff, business and branch. Keep the same browser tab open while resolving an uncertain payment. This is not an offline order/payment queue.
- **Check payment status** replays the same idempotency reference. Do not manually start another sale to recover a slow request.
- A price change requires explicit review of the server total and fresh cash confirmation. Browser totals are previews only.
- Receipt printing uses the browser print dialog. Hardware printer integration is not claimed.
- Refund/void and promotions require their canonical staff permissions; successful authentication alone does not grant them.
