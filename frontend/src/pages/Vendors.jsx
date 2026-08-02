import ModulePage from "./ModulePage";

const config = {
  title: "Vendor",
  module: "vendors",
  apiPath: "/api/vendors",
  exportFile: "vendors-export.csv",
  searchPlaceholder: "Search by name, category, email…",
  columns: [
    { key: "name", label: "Vendor Name", sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "contact", label: "Contact Person" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "website", label: "Website" },
  ],
  fields: [
    {
      name: "name",
      label: "Vendor Name",
      type: "text",
      required: true,
      placeholder: "Acme Supplies",
    },
    {
      name: "category",
      label: "Category",
      type: "text",
      placeholder: "Hardware, Software, Telecom…",
    },
    {
      name: "contact",
      label: "Contact Person",
      type: "text",
      placeholder: "John Smith",
    },
    {
      name: "email",
      label: "Email",
      type: "text",
      placeholder: "vendor@example.com",
    },
    {
      name: "phone",
      label: "Phone",
      type: "text",
      placeholder: "+92-300-1234567",
    },
    {
      name: "website",
      label: "Website",
      type: "text",
      placeholder: "https://vendor.com",
    },
    {
      name: "address",
      label: "Address",
      type: "textarea",
      fullWidth: true,
      placeholder: "Street, City, Country",
    },
    { name: "notes", label: "Notes", type: "textarea", fullWidth: true },
  ],
};

export default function Vendors() {
  return <ModulePage config={config} />;
}
