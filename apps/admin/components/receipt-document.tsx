import { formatPkr } from "@italian-pizza/shared";

export type ReceiptLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  options: string[];
  notes?: string;
};
export type ReceiptDesign = {
  logoSize?: number;
  logoAlignment?: "LEFT" | "CENTER" | "RIGHT";
  headerAlignment?: "LEFT" | "CENTER" | "RIGHT";
  showLogo?: boolean;
  showPhone?: boolean;
  showAddress?: boolean;
  showTax?: boolean;
  showCustomerAddress?: boolean;
  showPaymentStatus?: boolean;
  showBranchName?: boolean;
  showOrderNumber?: boolean;
  showOrderDate?: boolean;
  showOrderType?: boolean;
  showCustomerName?: boolean;
  showCustomerPhone?: boolean;
  showPaymentMethod?: boolean;
};

export type ReceiptData = {
  businessName: string;
  logoUrl?: string | null;
  branchName: string;
  businessAddress?: string | null;
  phone?: string | null;
  orderNumber: string;
  tokenNumber: number;
  createdAt: string;
  orderType: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  lines: ReceiptLine[];
  footer: string;
  footerNote?: string | null;
  width: 58 | 80;
  showPrices?: boolean;
  kind?: "customer" | "kitchen";
  design?: ReceiptDesign;
};
export function ReceiptDocument({ receipt }: { receipt: ReceiptData }) {
  const kitchen = receipt.kind === "kitchen";
  const design = receipt.design ?? {};
  const alignment = (design.headerAlignment ?? "CENTER").toLowerCase() as
    "left" | "center" | "right";
  const logoAlignment = design.logoAlignment ?? "CENTER";
  return (
    <section
      className={`print-root thermal-receipt receipt-${receipt.width}`}
      aria-label={kitchen ? "Kitchen ticket" : "Customer receipt"}
    >
      <header
        style={{
          textAlign: alignment,
          alignItems:
            alignment === "left"
              ? "flex-start"
              : alignment === "right"
                ? "flex-end"
                : "center",
        }}
      >
        {!kitchen &&
          design.showLogo !== false &&
          receipt.logoUrl /* eslint-disable-next-line @next/next/no-img-element */ && (
            <img
              className="thermal-logo"
              src={receipt.logoUrl}
              alt={`${receipt.businessName} logo`}
              style={{
                width: `${Math.min(200, Math.max(24, design.logoSize ?? 72))}px`,
                alignSelf:
                  logoAlignment === "LEFT"
                    ? "flex-start"
                    : logoAlignment === "RIGHT"
                      ? "flex-end"
                      : "center",
              }}
            />
          )}
        <strong>{receipt.businessName}</strong>
        {(kitchen || design.showBranchName !== false) && (
          <span>{receipt.branchName}</span>
        )}
        {!kitchen && design.showAddress !== false && receipt.businessAddress ? (
          <span>{receipt.businessAddress}</span>
        ) : null}
        {!kitchen && design.showPhone !== false && receipt.phone && (
          <span>{receipt.phone}</span>
        )}
      </header>
      <div className="receipt-token">
        <small>TOKEN</small>
        <b>{String(receipt.tokenNumber).padStart(3, "0")}</b>
        {(kitchen || design.showOrderType !== false) && (
          <span>{receipt.orderType.replaceAll("_", " ")}</span>
        )}
      </div>
      <div className="receipt-meta">
        {(kitchen || design.showOrderNumber !== false) && (
          <span>{receipt.orderNumber}</span>
        )}
        {(kitchen || design.showOrderDate !== false) && (
          <span>
            {new Date(receipt.createdAt).toLocaleString("en-PK", {
              timeZone: "Asia/Karachi",
            })}
          </span>
        )}
      </div>
      {(kitchen || design.showCustomerName !== false) &&
        receipt.customerName && (
          <p>
            <strong>Customer:</strong> {receipt.customerName}
          </p>
        )}
      {(kitchen || design.showCustomerPhone !== false) &&
        receipt.customerPhone && <p>{receipt.customerPhone}</p>}
      {(kitchen || design.showCustomerAddress !== false) &&
      receipt.deliveryAddress ? (
        <p>
          <strong>Deliver to:</strong> {receipt.deliveryAddress}
        </p>
      ) : null}
      {receipt.deliveryInstructions && (
        <p>
          <strong>Delivery note:</strong> {receipt.deliveryInstructions}
        </p>
      )}
      <div className="receipt-lines">
        {receipt.lines.map((line, index) => (
          <div key={`${line.name}-${index}`}>
            <span>
              <strong>
                {line.quantity}× {line.name}
              </strong>
              {line.options.map((option) => (
                <small key={option}>{option}</small>
              ))}
              {line.notes && <small>NOTE: {line.notes}</small>}
            </span>
            {(!kitchen || receipt.showPrices) && (
              <b>{formatPkr(line.unitPrice * line.quantity)}</b>
            )}
          </div>
        ))}
      </div>
      {!kitchen && (
        <div className="receipt-totals">
          <div>
            <span>Subtotal</span>
            <b>{formatPkr(receipt.subtotal)}</b>
          </div>
          {receipt.discount > 0 && (
            <div>
              <span>Discount</span>
              <b>−{formatPkr(receipt.discount)}</b>
            </div>
          )}
          {receipt.deliveryFee > 0 && (
            <div>
              <span>Delivery</span>
              <b>{formatPkr(receipt.deliveryFee)}</b>
            </div>
          )}
          {receipt.tax > 0 && design.showTax !== false ? (
            <div>
              <span>Tax</span>
              <b>{formatPkr(receipt.tax)}</b>
            </div>
          ) : null}
          <div className="receipt-grand">
            <span>Total</span>
            <b>{formatPkr(receipt.total)}</b>
          </div>
          {design.showPaymentMethod !== false && (
            <div>
              <span>Payment</span>
              <b>
                {receipt.paymentMethod}
                {design.showPaymentStatus !== false
                  ? ` · ${receipt.paymentStatus}`
                  : ""}
              </b>
            </div>
          )}
        </div>
      )}
      <footer>
        {kitchen
          ? "Preparation ticket · prices hidden unless enabled"
          : (
              <>
                <span>{receipt.footer}</span>
                {receipt.footerNote ? <small>{receipt.footerNote}</small> : null}
              </>
            )}
      </footer>
    </section>
  );
}
