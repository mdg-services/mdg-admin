/**
 * Human names for the service plugins. The raw plugin slug is an internal
 * identifier — super-admins work with it directly, but a plain admin should see
 * the product name of the service, not the folder it lives in.
 */
const SERVICE_LABELS: Record<string, string> = {
  'credit-dod-monitoring': 'Credit & DOD Monitoring',
  'custom-request': 'Custom request',
  'dsr-report': 'Daily Sales Report',
  'inspection-reports': 'Inspection Reports',
  'iras-shift-data': 'IRAS shift data',
};

/**
 * Friendly name for a service plugin slug. Unknown slugs are humanised
 * (`some-new-plugin` -> `Some new plugin`) rather than shown verbatim.
 */
export function serviceLabel(serviceId: string): string {
  const known = SERVICE_LABELS[serviceId];
  if (known) return known;
  const words = serviceId.replace(/[-_]+/g, ' ').trim();
  if (words.length === 0) return serviceId;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
