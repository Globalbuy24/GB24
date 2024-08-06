const https = require('follow-redirects').https;
const fs = require('fs');


const options = {
    'method': 'POST',
    'hostname': 'vvn8np.api.infobip.com',
    'path': '/sms/2/text/advanced',
    'headers': {
        'Authorization': 'App 7423850e235a5ee716d199e09b38062c-26cbd0e7-1598-4ca6-89cf-35cad5c9047d',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    'maxRedirects': 20
};

const sms = https.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
        chunks.push(chunk);
    });

    res.on("end", function (chunk) {
        var body = Buffer.concat(chunks);
        console.log(body.toString());
    });

    res.on("error", function (error) {
        console.error(error);
    });
});




module.exports = sms;