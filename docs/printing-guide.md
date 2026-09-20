# Printing guide

The supported production baseline is the browser/system print dialog through `BrowserPrintAdapter`. It supports dedicated customer receipts, preparation-focused kitchen tickets, 80 mm paper and a 58 mm fallback. Print CSS removes the Admin shell, controls, shadows and backgrounds.

Configure receipt width, auto-open after POS sale, kitchen-ticket behavior, price visibility, footer and copy count under **Printing**. Then select the matching paper width in the operating-system printer preferences. Always test margins and scaling with the exact printer and browser before launch.

Browsers do not universally allow silent printing. QZ Tray, PrintNode or a managed WebUSB/WebSerial bridge can implement `PrinterAdapter` later, but none is installed or presented as working. Physical printer compatibility, cutter commands, cash-drawer pulses and silent-print policies require hardware testing.
