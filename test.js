

const http = require('http');

function postReq(data) {
  const dataString = JSON.stringify(data);
  const options = {
    hostname: 'localhost',
    port: 5001,
    path: '/judge',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': dataString.length
    }
  };

  const req = http.request(options, res => {
    let responseBody = '';
    res.on('data', chunk => {
      responseBody += chunk;
    });
    res.on('end', () => {
      console.log('Response:', responseBody);
    });
  });

  req.on('error', error => {
    console.error(error);
  });

  req.write(dataString);
  req.end();
}

const code7 = `#include <iostream>
#include <string>
#include <cctype>
#include <algorithm>
using namespace std;

int main() {
    string s;
    if (!getline(cin, s)) return 0;
    string clean;
    for (char c : s) {
        if (c != ' ' && c != '\\n' && c != '\\r') {
            clean += tolower(c);
        }
    }
    string rev = clean;
    reverse(rev.begin(), rev.end());
    if (clean == rev) cout << "OPEN\\n";
    else cout << "LOCKED\\n";
    return 0;
}
`;

const code8 = `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<long long> a(n);
    for (int i=0; i<n; i++) cin >> a[i];
    long long max_so_far = a[0];
    long long curr_max = a[0];
    for (int i=1; i<n; i++) {
        curr_max = max((long long)a[i], curr_max + a[i]);
        max_so_far = max(max_so_far, curr_max);
    }
    cout << max_so_far << "\\n";
    return 0;
}
`;

postReq({ code: code7, roomOrder: 7 });
setTimeout(() => postReq({ code: code8, roomOrder: 8 }), 2000);
