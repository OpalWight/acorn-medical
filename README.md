# Acorn Medical

Acorn Medical is a 24-hour inpatient scheduling demo. The calendar combines synthetic sleep readings, nursing coverage, fixed care times, and flexible visit windows. Staff can review a suggested move or drag across an empty slot to draft an event for a patient.

## Run the demo locally

With Node.js 22.13 or later and Python 3 installed, run these commands from the repository root:

```sh
cd wardround
npm ci
npm run build:offline
python3 -m http.server 8080 --bind 127.0.0.1 --directory out/acorn
```

Open `http://127.0.0.1:8080`. The offline demo saves changes in the current browser. Run `node --test tests/*.test.ts` from `wardround` to check the scheduler.

The `eeg-pilot` folder contains research scripts and setup notes. Recordings, model weights, results, credentials, and deployment configuration are excluded from this repository.
