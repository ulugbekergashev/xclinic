const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const provider = process.argv[2]; // 'sqlite' or 'postgresql'

if (!provider || !['sqlite', 'postgresql'].includes(provider)) {
    console.error('Usage: node set-provider.js <sqlite|postgresql>');
    process.exit(1);
}

console.log(`Switching Prisma provider to ${provider}...`);

let schema = fs.readFileSync(schemaPath, 'utf8');

if (provider === 'postgresql') {
    schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
    schema = schema.replace('url      = "file:./dev.db"', 'url      = env("DATABASE_URL")');
} else {
    schema = schema.replace('provider = "postgresql"', 'provider = "sqlite"');
    schema = schema.replace('url      = env("DATABASE_URL")', 'url      = "file:./dev.db"');
}

fs.writeFileSync(schemaPath, schema);
console.log('Done.');
