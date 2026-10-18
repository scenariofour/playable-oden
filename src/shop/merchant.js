// Demo merchant settings: everything a shop decides about getting its food to customers, as plain data. Which
// fulfillment methods it offers and for which kind of product (hot food is never shipped), its stores and hours, the
// local delivery area by postal code, shipping rates, payment methods and free extras.
// All of it is made up for the demo: no real store, delivery area, carrier, rate or payment provider stands behind it.
// Pick one with ?merchant=<id>; a real integration would load this from the merchant's own systems.

const STORES = [
  { id: 'station', name: 'Station front', address: '1-1 Demo-cho, Shibuya-ku, Tokyo', hours: [7, 23] },
  { id: 'river', name: 'Riverside', address: '2-8 Sample-dori, Meguro-ku, Tokyo', hours: [9, 21] },
];

export const MERCHANTS = {
  // the default: a counter selling hot oden bowls to eat soon
  counter: {
    id: 'counter', name: 'Oden Counter', item: { temp: 'hot', label: 'Hot oden bowl', note: 'Ready to eat' },
    tax: { food: 0.08, service: 0.1 }, // Japan: take-away food 8%, delivery fees 10%; all prices include tax
    fulfillment: {
      pickup: { temps: ['hot', 'chilled'], stores: STORES, leadMin: 10, slotMin: 15 },
      delivery: {
        temps: ['hot', 'chilled'], hours: [10, 22], leadMin: 35, windowMin: 30, minimum: 800, freeOver: 2000,
        zones: [ // by the first three digits of the postal code
          { prefix: '150', area: 'Shibuya', fee: 300 },
          { prefix: '151', area: 'Shibuya (Yoyogi)', fee: 300 },
          { prefix: '153', area: 'Meguro', fee: 400 },
        ],
      },
    },
    payments: [
      { id: 'card', title: 'Credit or debit card', note: 'Card details go into the payment provider’s secure form. This demo doesn’t collect them.' },
      { id: 'store', title: 'Pay at the store', note: 'Cash, card or IC card when you pick up.', only: ['pickup'] },
    ],
    extras: true,
  },
  // the same bowls sold as chilled packs to heat at home, which can also be shipped
  chilled: {
    id: 'chilled', name: 'Oden Counter · Home packs', item: { temp: 'chilled', label: 'Chilled oden pack', note: 'Heat at home · keeps 3 days' },
    tax: { food: 0.08, service: 0.1 },
    fulfillment: {
      pickup: { temps: ['hot', 'chilled'], stores: STORES, leadMin: 30, slotMin: 30 },
      delivery: {
        temps: ['hot', 'chilled'], hours: [10, 20], leadMin: 120, windowMin: 120, minimum: 1500, freeOver: 4000,
        zones: [{ prefix: '150', area: 'Shibuya', fee: 400 }, { prefix: '151', area: 'Shibuya (Yoyogi)', fee: 400 }, { prefix: '153', area: 'Meguro', fee: 500 }],
      },
      shipping: {
        temps: ['chilled', 'frozen'], cutoffHour: 15, dateChoices: 5,
        exclude: [{ prefix: '90', area: 'Okinawa' }], // chilled parcels don't reach every region in time
        rates: [
          { id: 'standard', title: 'Chilled standard', price: 980, days: 2 },
          { id: 'express', title: 'Chilled express', price: 1480, days: 1 },
        ],
      },
    },
    payments: [
      { id: 'card', title: 'Credit or debit card', note: 'Card details go into the payment provider’s secure form. This demo doesn’t collect them.' },
      { id: 'store', title: 'Pay at the store', note: 'Cash, card or IC card when you pick up.', only: ['pickup'] },
    ],
    extras: false,
  },
};

export const merchantFor = (id) => MERCHANTS[id] || MERCHANTS.counter;
