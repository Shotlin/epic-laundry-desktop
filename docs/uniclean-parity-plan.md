# Epic Laundry Uniclean Parity Plan

This plan turns the supplied Uniclean audit and LNDRY product workbook into the Epic Laundry operating flow. It keeps existing server backed records, role checks, audit entries, and explicit transaction commits.

## Source requirements

- `uniclean_ui_flow_audit.docx` defines the desktop shell, navigation map, dashboard destinations, reporting hierarchy, settings groups, and safe write boundaries.
- `Lndry Tech and Product .xlsx` adds customer typeahead, customer creation, garment capture, per item price controls, charge discount tax controls, payment links, catalogue creation, dashboard drilldowns, and edit in the booking flow.

## Delivery sequence

1. **Shell and dashboard**: explicit mobile navigation, universal search, labelled reporting tools, dashboard KPI drilldowns, attention queues, quick actions, and display only business metrics.
2. **Order and billing**: customer lookup and add flow, delivery selection, garment search and quantities, adjustable pricing, charges discounts tax, payment choice, remarks and explicit booking confirmation.
3. **Store orders**: readable filtering, order history and summary, reusable booking edit flow, and separated bulk mutations with confirmation.
4. **Shared operational modules**: expense, imports with preview and validation, all fifteen reports, and grouped settings editors.
5. **Quality gates**: route and API tests, type checks, keyboard labels, responsive shell checks, and controlled write path verification.

## Non negotiable rules

- A dashboard metric is a link only when it leads to a meaningful queue. It must show a visible drilldown affordance and pass a readable filter value.
- Booking, payment collection, imports, batch status changes, WhatsApp sends, and configuration saves remain explicit commits. Opening their UI does not commit data.
- Read only order history and summary stay visually separate from status changing controls.
- All screens use the existing Epic Laundry permissions and authoritative server records.
