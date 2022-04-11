const crypto = require('crypto'),
    algorithm = 'aes-256-ctr',
    key = 'FoCKvdLslUuB4y3EZlKate7XGottHski';

// crypto function to encrypt data
const encrypt = (data) => {
    if(!data) return '';
    
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm,key,iv);
    let encrypted = cipher.update(data,'utf8','hex');
        encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted.toString()}`;
};

// crypto function to decrypt data
const decrypt = (data) => {
    const textParts = data.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encrypted = Buffer.from(textParts.join(':'), 'hex');

    const decipher = crypto.createDecipheriv(algorithm,key,iv);
    let decrypted = decipher.update(encrypted,'hex','utf8');
        decrypted += decipher.final('utf8');

    return decrypted.toString();
};

// crypto function to hash data
const hash = (data) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(data, salt, 64).toString('hex');

    return salt + ':' + derivedKey;
};

// crypto function to compare data and hash
const verify = (data, hash) => {
    const [salt, key] = hash.split(":")
    const keyBuffer = Buffer.from(key, 'hex')
    const derivedKey = crypto.scryptSync(data, salt, 64)
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
};

module.exports = {
    encrypt,
    decrypt,
    hash,
    verify
};