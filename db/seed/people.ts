export type DemoRole = 'owner' | 'admin' | 'manager' | 'viewer'

/** One demo user per role; the owner is the account "Enter the demo" opens. */
export const DEMO_USERS: readonly { role: DemoRole; name: string; email: string }[] = [
  { role: 'owner', name: 'Dana Ortiz', email: 'dana.ortiz@formline.example' },
  { role: 'admin', name: 'Noah Becker', email: 'noah.becker@formline.example' },
  { role: 'manager', name: 'Priya Nair', email: 'priya.nair@formline.example' },
  { role: 'viewer', name: 'Tomás Ferreira', email: 'tomas.ferreira@formline.example' },
]

export const FIRST_NAMES = [
  'Anna', 'Lukas', 'Mia', 'Jonas', 'Sofia', 'Elias', 'Nora', 'Leon', 'Clara', 'Felix', 'Lea', 'Noah', 'Emma', 'Paul', 'Ida',
  'Finn', 'Marie', 'Ben', 'Lina', 'Mateo', 'Julia', 'Oscar', 'Alma', 'Hugo', 'Elin', 'Tim', 'Zoe', 'Lars', 'Mila', 'Sam',
  'Ines', 'Theo', 'Nina', 'Adam', 'Eva', 'Louis', 'Sara', 'Max', 'Isla', 'Omar',
] as const

export const LAST_NAMES = [
  'Weber', 'Fischer', 'Schulz', 'Koch', 'Bauer', 'Wolf', 'Braun', 'Hoffmann', 'Lang', 'Berg', 'Jansen', 'de Vries', 'Bakker',
  'Visser', 'Martin', 'Bernard', 'Dubois', 'Moreau', 'Rossi', 'Ricci', 'Garcia', 'Lopez', 'Silva', 'Costa', 'Novak', 'Kowalski',
  'Nielsen', 'Larsen', 'Lindqvist', 'Murphy', 'Walsh', 'Clarke', 'Turner', 'Hughes', 'Carter', 'Reed', 'Brooks', 'Nguyen',
  'Kim', 'Haddad',
] as const

export const EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'] as const

/** Where the store's customers are; the weights lean towards the German-speaking market the store ships from. */
export const PLACES: readonly { city: string; country: string; postal: string; weight: number }[] = [
  { city: 'Berlin', country: 'DE', postal: '10115', weight: 14 },
  { city: 'Hamburg', country: 'DE', postal: '20095', weight: 8 },
  { city: 'Munich', country: 'DE', postal: '80331', weight: 8 },
  { city: 'Cologne', country: 'DE', postal: '50667', weight: 5 },
  { city: 'Leipzig', country: 'DE', postal: '04109', weight: 4 },
  { city: 'Vienna', country: 'AT', postal: '1010', weight: 6 },
  { city: 'Zurich', country: 'CH', postal: '8001', weight: 4 },
  { city: 'Amsterdam', country: 'NL', postal: '1012 JS', weight: 6 },
  { city: 'Rotterdam', country: 'NL', postal: '3011 AD', weight: 3 },
  { city: 'Paris', country: 'FR', postal: '75003', weight: 6 },
  { city: 'Lyon', country: 'FR', postal: '69002', weight: 2 },
  { city: 'Brussels', country: 'BE', postal: '1000', weight: 3 },
  { city: 'Copenhagen', country: 'DK', postal: '1050', weight: 4 },
  { city: 'Stockholm', country: 'SE', postal: '111 29', weight: 4 },
  { city: 'Milan', country: 'IT', postal: '20121', weight: 4 },
  { city: 'Madrid', country: 'ES', postal: '28013', weight: 3 },
  { city: 'Lisbon', country: 'PT', postal: '1100-148', weight: 2 },
  { city: 'Warsaw', country: 'PL', postal: '00-001', weight: 3 },
  { city: 'Prague', country: 'CZ', postal: '110 00', weight: 2 },
  { city: 'Dublin', country: 'IE', postal: 'D02 XY45', weight: 2 },
  { city: 'London', country: 'GB', postal: 'EC1A 1BB', weight: 6 },
  { city: 'Manchester', country: 'GB', postal: 'M1 1AE', weight: 2 },
  { city: 'New York', country: 'US', postal: '10001', weight: 5 },
  { city: 'Chicago', country: 'US', postal: '60601', weight: 2 },
  { city: 'Austin', country: 'US', postal: '78701', weight: 2 },
  { city: 'Toronto', country: 'CA', postal: 'M5H 2N2', weight: 2 },
]

export const STREETS = [
  'Lindenstraße', 'Kastanienallee', 'Hafenweg', 'Bergmannstraße', 'Rue des Lilas', 'Avenue Verte', 'Keizersgracht',
  'Prinsengracht', 'Via Roma', 'Calle Mayor', 'Elm Street', 'Park Avenue', 'Queen Street', 'Harbour Road', 'Mill Lane',
] as const

export const ORDER_NOTES = [
  'Customer asked for a gift receipt.',
  'Deliver to the back entrance, the front bell is broken.',
  'Frame ordered separately from another shop.',
  'Replacement for a print that arrived creased.',
  'Customer will collect from the courier depot.',
  'Address confirmed by email after a typo in the postcode.',
] as const
