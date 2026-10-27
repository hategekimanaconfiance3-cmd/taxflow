import { exec } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

const execAsync = promisify(exec);

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    }),
  );
}

async function ensureDockerInstalled() {
  console.log("Checking if Docker is installed...");
  try {
    await execAsync("docker --version");
    console.log("Docker is installed.");
  } catch {
    console.error("Docker is not installed.");
    console.log("Install Docker: https://docs.docker.com/get-docker/");
    process.exit(1);
  }
}

async function containerExists(name: string) {
  try {
    const { stdout } = await execAsync(
      `docker ps -a --filter "name=${name}" --format "{{.Names}}"`,
    );
    return stdout.trim() === name;
  } catch {
    return false;
  }
}

async function containerRunning(name: string) {
  try {
    const { stdout } = await execAsync(
      `docker ps --filter "name=${name}" --format "{{.Names}}"`,
    );
    return stdout.trim() === name;
  } catch {
    return false;
  }
}

async function setupLocalPostgres() {
  await ensureDockerInstalled();

  const taxflowExists = await containerExists("taxflow_db");
  const tinExists = await containerExists("tin_db");

  if (taxflowExists && tinExists) {
    const taxflowRunning = await containerRunning("taxflow_db");
    const tinRunning = await containerRunning("tin_db");

    if (taxflowRunning && tinRunning) {
      console.log("Both containers already running.");
      return;
    }

    console.log("Starting existing containers...");
    await execAsync("docker start taxflow_db");
    await execAsync("docker start tin_db");
    return;
  }

  console.log("Creating docker-compose.yml...");

  const dockerComposeContent = `
services:
  taxflow_db:
    image: postgres:17.7-trixie
    container_name: taxflow_db
    environment:
      POSTGRES_DB: postgres
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "54322:5432"
    volumes:
      - taxflow_data:/var/lib/postgresql/data

  tin_db:
    image: postgres:17.7-trixie
    container_name: tin_db
    environment:
      POSTGRES_DB: postgres
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "54323:5432"
    volumes:
      - tin_data:/var/lib/postgresql/data

volumes:
  taxflow_data:
  tin_data:
`;

  await fs.writeFile(
    path.join(process.cwd(), "docker-compose.yml"),
    dockerComposeContent.trim(),
  );

  console.log("docker-compose.yml created.");
  console.log("Starting containers...");

  await execAsync("docker compose up -d --remove-orphans");
  console.log("Containers started successfully.");
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

async function getEnvVars(): Promise<Record<string, string>> {
  console.log("Step 1: Database Setup");

  const dbChoice = await question(
    "Use Local Docker DBs (L) or Remote DBs (R)? (L/R): ",
  );

  const secret = generateSecret();

  if (dbChoice.toLowerCase() === "l") {
    await setupLocalPostgres();

    return {
      DATABASE_URL:
        "postgres://postgres:postgres@localhost:54322/postgres",
      TIN_DATABASE_URL:
        "postgres://postgres:postgres@localhost:54323/postgres",
      NODE_ENV: "development",
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_URL: "http://localhost:3000",
    };
  }

  console.log("Using remote databases.");
  const mainDb = await question("Enter Taxflow DATABASE_URL: ");
  const tinDb = await question("Enter TIN_DATABASE_URL: ");
  const appUrl = await question(
    "Enter app URL (e.g. https://taxflow.example.com): ",
  );

  return {
    DATABASE_URL: mainDb,
    TIN_DATABASE_URL: tinDb,
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: appUrl,
  };
}

async function writeEnvFile(envVars: Record<string, string>) {
  console.log("Writing .env file...");

  const envContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  await fs.writeFile(path.join(process.cwd(), ".env"), envContent);

  console.log(".env file created.");
}

async function main() {
  const envVars = await getEnvVars();

  await writeEnvFile(envVars);

  console.log("Setup completed successfully.");
}

main().catch(console.error);