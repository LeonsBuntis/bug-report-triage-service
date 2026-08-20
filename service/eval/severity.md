| #   | Input                                                                                   | Expected severity | Why                                                                     |
| --- | --------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| 1   | `The production system is completely down. No users can access any functionality.`      | critical          | Complete outage                                                         |
| 2   | `A security vulnerability allows one customer to view another customer's invoices.`     | critical          | Security/data exposure                                                  |
| 3   | `Submitting an invoice sometimes deletes the invoice from the database.`                | critical          | Data loss                                                               |
| 4   | `All customers are unable to log in. The login endpoint returns 500 for every request.` | high              | Core functionality unavailable, but not necessarily total system outage |
| 5   | `Customers cannot download invoices. There is currently no workaround.`                 | high              | Major functionality unavailable                                         |
| 6   | `Invoice export is broken for customers using the CSV format. PDF export still works.`  | medium            | Significant but limited; workaround exists                              |
| 7   | `The search page occasionally returns an error. Refreshing the page fixes it.`          | medium            | Functionality affected, easy workaround                                 |
| 8   | `The submit button is aligned a few pixels too far to the right.`                       | low               | Cosmetic                                                                |
| 9   | `The API documentation says the endpoint accepts XML, but it only accepts JSON.`        | low               | Documentation issue                                                     |
| 10  | `URGENT!!! CRITICAL!!! The padding around the login button is wrong!!!`                 | low               | Tests resistance to reporter tone                                       |
| 11  | `Users can't log in.`                                                                   | high              | depending on your rubric — I'd define this explicitly in your eval spec |
| 12  | `The application is broken.`                                                            | low/medium + low  | confidence if you support confidence                                    |
| 13  | `Sometimes the payment fails.`                                                          | medium            |                                                                         |
| 14  | `The database is slow.`                                                                 | medium or low;    | insufficient impact information                                         |
