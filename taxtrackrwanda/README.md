# TaxTrackRwanda

Production-oriented Django + DRF backend for tax tracking across the supply chain.

## Stack

- Django
- Django REST Framework
- PostgreSQL
- JWT (SimpleJWT)
- Gunicorn + WhiteNoise for production serving

## Project apps

- `apps.accounts`
- `apps.ai_engine`
- `apps.products`
- `apps.transactions`
- `apps.compliance`
- `apps.dashboards`

---

## Local development

1. Copy environment template:

   ```bash
   cp .env.example .env
   ```

2. Start DB:

   ```bash
   docker compose up -d db
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Run migrations and server:

   ```bash
   export DJANGO_SETTINGS_MODULE=config.settings.dev
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```

---

## Production hardening included

- Split settings (`base/dev/prod`)
- Environment-first config (`.env` / `DATABASE_URL`)
- Enforced secure cookies and SSL redirect (prod)
- HSTS and security headers
- `ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS` required in prod
- Structured console logging for app + Django loggers
- Static files via WhiteNoise

---


## AI engine architecture scaffold

A new `apps.ai_engine` app now provides service-layer structure only (no integrated business logic yet).

Contained modules:
- `fraud_detection.py`
- `compliance_scoring.py`
- `revenue_prediction.py`
- `alerts.py`

Implementation stubs are organized in `apps/ai_engine/services/` for future integration.

---

## Nightly compliance score scheduler

Compliance score and grade are recalculated nightly using:

```bash
python manage.py recalculate_compliance_scores
```

Scheduling options:
- **Render**: use the cron service in `render.yaml` (`0 0 * * *`).
- **VPS**: add cron entry:

```bash
0 0 * * * cd /path/to/taxtrackrwanda && /usr/bin/python3 manage.py recalculate_compliance_scores >> /var/log/taxtrackrwanda-compliance.log 2>&1
```

## AI alert engine (RRA dashboard)

Trigger conditions:
- Risk score > 70
- Tax deviation > 30%
- Merchant grade = D

Alert fields:
- merchant
- reason
- severity (`low`, `medium`, `high`)
- created_at
- resolved

Endpoint:
- `GET /api/rra/alerts/` (RRA only)

## RRA revenue prediction endpoint

- Endpoint: `GET /api/rra/predictions/`
- Access: **RRA role only**
- Uses historical completed transactions and linear regression.
- Returns per-merchant predictions for next 30 days:
  - sales
  - VAT

## AI sales prediction endpoint

- Endpoint: `GET /api/dashboards/sales-predictions/?days=30`
- Uses historical completed transactions.
- Predicts next N days sales per merchant using a simple linear regression model.
- Returns expected VAT revenue using 18% VAT.

---

## Docker deployment

### Build and run

```bash
docker compose up --build -d
```

Container entrypoint automatically runs:
- `python manage.py migrate --noinput`
- `python manage.py collectstatic --noinput`
- `gunicorn config.wsgi:application`

App will be available at `http://localhost:8000`.

---

## Deploy on Render

1. Create a **PostgreSQL** service in Render.
2. Create a **Web Service** from this repo.
3. Set start command:

   ```bash
   ./scripts/entrypoint.sh
   ```

4. Set required environment variables:
   - `DJANGO_SETTINGS_MODULE=config.settings.prod`
   - `DJANGO_SECRET_KEY=<strong-secret>`
   - `DJANGO_ALLOWED_HOSTS=<your-render-domain>`
   - `DJANGO_CSRF_TRUSTED_ORIGINS=https://<your-render-domain>`
   - `DATABASE_URL=<render-postgres-internal-url>`
   - `DB_SSL_REQUIRE=True`

5. Deploy. Verify health by opening `/api/schema/`.

---

## Deploy on VPS (Ubuntu + Nginx)

1. Provision server and install packages:

   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose-plugin nginx
   ```

2. Clone project and configure `.env`:
   - Use `config.settings.prod`
   - Set real domain in `DJANGO_ALLOWED_HOSTS`
   - Set HTTPS origins in `DJANGO_CSRF_TRUSTED_ORIGINS`
   - Set strong `DJANGO_SECRET_KEY`

3. Start app stack:

   ```bash
   docker compose up --build -d
   ```

4. Configure Nginx reverse proxy to `127.0.0.1:8000` and enable TLS (Let's Encrypt).
5. Set `SECURE_SSL_REDIRECT=True` in `.env` once HTTPS is active.
6. Monitor logs:

   ```bash
   docker compose logs -f web
   ```

---

## Security checklist before go-live

- [ ] `DJANGO_SECRET_KEY` is strong and private
- [ ] `DJANGO_DEBUG=False`
- [ ] `DJANGO_ALLOWED_HOSTS` set correctly
- [ ] `DJANGO_CSRF_TRUSTED_ORIGINS` set for HTTPS domains
- [ ] TLS enabled in front proxy/load balancer
- [ ] Database credentials rotated and private
- [ ] Regular backups enabled for PostgreSQL
