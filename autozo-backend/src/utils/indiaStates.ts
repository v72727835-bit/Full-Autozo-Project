/** Every state and union territory of India, and a matcher for what a map service calls them. */
export const INDIA_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const ALIASES: Record<string, string> = {
  'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi',
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  uttaranchal: 'Uttarakhand',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** The exact name from our list for whatever the map service called a state; '' when unknown. */
export function matchState(name?: string): string {
  if (!name) return '';
  const n = norm(name);
  if (ALIASES[n]) return ALIASES[n];
  const exact = INDIA_STATES.find((s) => norm(s) === n);
  if (exact) return exact;
  return INDIA_STATES.find((s) => norm(s).includes(n) || n.includes(norm(s))) ?? '';
}
