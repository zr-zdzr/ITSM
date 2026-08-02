import ModulePage from "./ModulePage";
import Badge from "../components/ui/Badge";
import AssetHistoryTimeline from "../components/ui/AssetHistoryTimeline";
import { genAssetTag } from "../lib/utils";

const config = {
  title: "Network Device",
  module: "network",
  apiPath: "/api/network",
  exportFile: "network-export.csv",
  searchPlaceholder: "Search by brand, model, IP, MAC…",
  qrData: (row) => {
    const brandModel = `${row.brand || ""} ${row.model || ""}`.trim();
    const tag =
      row.asset_tag ||
      genAssetTag(row.purchase_date, "ID") ||
      brandModel ||
      "Network Device";
    return {
      label: tag,
      value: `Tag:${tag}\nType:${row.device_type || ""}\nBrand:${row.brand || ""}\nModel:${row.model || ""}\nSN:${row.serial_number || ""}\nIP:${row.ip_address || ""}\nAssigned:${row.assigned_to || "Unassigned"}`,
      details: [
        row.device_type && `Type: ${row.device_type}`,
        (row.brand || row.model) && brandModel,
        row.ip_address && `IP: ${row.ip_address}`,
        row.assigned_to ? `Assigned To: ${row.assigned_to}` : "Unassigned",
      ].filter(Boolean),
    };
  },
  columns: [
    { key: "asset_tag", label: "Asset Tag", sortable: true },
    { key: "device_type", label: "Type", sortable: true },
    { key: "brand", label: "Brand", sortable: true },
    { key: "model", label: "Model" },
    { key: "serial_number", label: "Serial No." },
    { key: "ip_address", label: "IP Address" },
    { key: "location", label: "Location" },
    {
      key: "status",
      label: "Status",
      render: (v) => <Badge status={v}>{v || "—"}</Badge>,
    },
  ],
  fields: [
    {
      name: "asset_tag",
      label: "Asset Tag",
      type: "text",
      placeholder: "Auto-generated from purchase date",
    },
    {
      name: "device_type",
      label: "Device Type",
      type: "select",
      required: true,
      options: [
        "Switch",
        "Router",
        "Firewall",
        "WiFi Controller",
        "Access Point",
        "UPS",
        "NAS",
        "Other",
      ],
    },
    {
      name: "brand",
      label: "Brand",
      type: "text",
      required: true,
      placeholder: "Cisco, TP-Link…",
    },
    { name: "model", label: "Model", type: "text", placeholder: "SG350-28…" },
    { name: "serial_number", label: "Serial No.", type: "text" },
    {
      name: "ip_address",
      label: "IP Address",
      type: "text",
      placeholder: "192.168.1.1",
    },
    {
      name: "mac_address",
      label: "MAC Address",
      type: "text",
      placeholder: "AA:BB:CC:DD:EE:FF",
    },
    {
      name: "location",
      label: "Location",
      type: "text",
      placeholder: "Server Room, Floor 2…",
    },
    {
      name: "rack_location",
      label: "Rack Location",
      type: "text",
      placeholder: "Rack A - U12",
    },
    {
      name: "vlan",
      label: "VLAN",
      type: "text",
      placeholder: "VLAN 10, VLAN 20",
    },
    { name: "firmware_version", label: "Firmware Version", type: "text" },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: ["in_use", "available", "repair", "retired"],
    },
    {
      name: "vendor",
      label: "Vendor",
      type: "text",
      placeholder: "Cisco Systems, APC…",
    },
    { name: "purchase_date", label: "Purchase Date", type: "date" },
    { name: "warranty_expiry", label: "Warranty Expiry", type: "date" },
    {
      name: "purchase_price_pkr",
      label: "Purchase Price (PKR)",
      type: "number",
      placeholder: "0.00",
    },
    {
      name: "useful_life_years",
      label: "Useful Life (Years)",
      type: "number",
      placeholder: "7",
    },
    { name: "notes", label: "Notes", type: "textarea", fullWidth: true },
  ],
  viewExtra: (row) => (
    <AssetHistoryTimeline assetType="network" assetId={row.id} />
  ),
};

export default function NetworkDevices() {
  return <ModulePage config={config} />;
}
