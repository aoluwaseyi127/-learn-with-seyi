window.LEARN_WITH_SEYI_API = '';
window.LEARN_WITH_SEYI_SHEET = 'https://script.google.com/macros/s/AKfycbwSXoUtssUbIJm-UHv1KjW-k0HIykUNSRM6yx4bKVKkrlVuy2KZFfCB0qizi_r8y-shzA/exec';

// ---------- PAYMENTS ----------
// One monthly plan gives access to every level (A1 to C1) for one month.
// Set enabled to true once the card link and bank details below are filled in.
// While it is false, nothing is locked and no registration form is shown.
window.LWS_PAYMENTS = {
  enabled: true,
  plan: {
    name: 'Monthly class access',
    price: '£40 / month',
    description: 'Full access to every level, A1 to C1',
    cardLink: 'https://buy.stripe.com/7sY4gz3GzeJd5oFgqS6EU00'
  },
  // Each row is [label, value]. Rows with an empty value are not shown.
  bank: [
    ['Account name', 'Funmilayo Akomolafe'],
    ['Bank', 'Monzo Bank'],
    ['Account number', '84940589'],
    ['Sort code', '04-00-03'],
    ['IBAN', 'GB28MONZ04000384940589'],
    ['SWIFT / BIC', 'MONZGB2L']
  ],
  bankNote: 'Use your full name as the payment reference, then press "I\'ve paid" below so we can match it to your account.'
};
