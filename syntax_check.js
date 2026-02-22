const fs = require('fs');
const hbs = fs.readFileSync('views/user.handlebars', 'utf8');
let match;
let lastMatch = null;
const regex = /<script type="text\/javascript">([\s\S]*?)<\/script>/g;
while ((match = regex.exec(hbs)) !== null) {
    lastMatch = match[1];
}
if (lastMatch !== null) {
    lastMatch = lastMatch.replace(/{{{ scriptTree }}}/g, '[]');
    fs.writeFileSync('test_syntax.js', lastMatch);
}
