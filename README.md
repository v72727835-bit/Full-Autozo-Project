# Autozo

Quick-commerce platform. One repository, four projects:

| Folder | What it is | Stack |
| --- | --- | --- |
| `autozo-backend` | API (customers, riders, warehouses, admin), plus the rider app in `autozo-mobile` | Express, MongoDB, TypeScript |
| `autozo-web` | Customer website (bingoor.com) | Next.js |
| `autozo-admin` | Super admin and warehouse panel (admin.bingoor.com) | Next.js |
| `blinkit-app-` | Customer mobile app | React Native |

Each folder has its own `package.json`; install and run them separately. Secrets (database URL, JWT, payment and login keys) are never stored in this repository: the server keeps them in its environment, and Razorpay / Google / Facebook keys are saved from the admin panel under "Login & Payments".
