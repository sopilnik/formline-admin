# Security Policy

Formline Admin is a portfolio demo: the admin panel of the Formline poster store, live at
https://formline-admin.sopilnik.dev and deployed from `main`. Stripe runs in test mode only; no real payment passes
through the panel.

A visitor works in a sandbox, a copy of invented demo data that is deleted after two hours without activity and after
24 hours at most. The store owner's own workspace keeps the store's test orders with the email, name, city and country
Stripe holds for them; a daily job replaces those of each customer first seen 30 or more days ago with invented ones.

If you find a security issue in this repository or in the live panel, report it privately: through GitHub's private
vulnerability reporting form on this repository's Security tab, or through the contact details on https://sopilnik.dev.
Never in a public issue or pull request.

Please test with your own sandbox only, and do not run load or denial-of-service tests against the live panel.

Expect a reply within five working days.

This project does not run a bug bounty.
