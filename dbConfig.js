const config = {
    user: 'emr',
    password: 'Simmed@!@#$',
    server: '192.168.20.100', // You may need to use 'localhost' or an IP address
    database: 'deepface',
    options: {
        encrypt: true, // Use this if you're on Windows Azure
        trustServerCertificate: true // Change to true for local dev / self-signed certs
    }
};

module.exports = config;
