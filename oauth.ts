import http from 'http';
import https from 'https';
import url, { URL } from 'url';
import querystring from 'querystring';
import { config } from './config';

export const enum Provider {
    github = 'github',
}

export const enum Env {
    local,
    test,
    staging,
    prod,
}

const oauthProviders = {
    github: {
        login: `https://github.com/login/oauth/authorize?client_id=${config.githubId}&redirect_uri=REDIRECT_URI&scope=user&state=STATE`,
        accessToken: `https://github.com/login/oauth/access_token?client_id=${config.githubId}&client_secret=${config.githubSecret}&code=CODE&redirect_uri=REDIRECT_URI`,
        getUser: `https://api.github.com/user`,
        // curl -H "Authorization: token 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" https://api.github.com/user
    },
};

const routes:{[route:string]:(req:http.IncomingMessage, res:http.ServerResponse, next:Function) => void} = {
    '/entry': (req, res, next) => {
        if (!req.url) {
            return next(new Error('Unknow url'));
        }
        const query = querystring.parse(url.parse(req.url!).query!)
        let targetUrl:string;
        switch (query.provider) {
            case Provider.github:
                targetUrl = oauthProviders.github.login;
                break;
            default:
                return next(new Error('unknow provider'));
        }
        targetUrl = targetUrl.replace('REDIRECT_URI', encodeURI(config.oauthUrl + 'callback')).replace('STATE', [query.provider, query.env].toString()); // wechat remove all " here so have to be so ugly;
        console.log(targetUrl);
        res.writeHead(302, {'Location': targetUrl});
        res.end();
    },
    '/callback': async (req, res, next) => {
        if (!req.url) {
            res.writeHead(200);
            res.end(`
                <p>Unknow url'</p>
            `);
            return;
            // return next(new Error('Unknow url'));
        }
        const query = querystring.parse(url.parse(req.url!).query!)
        if (!query.code) {
            res.writeHead(200);
            res.end(`
                <p>unauthorized</p>
            `);
            return;
            // return next(new Error('unauthorized'));
        }
        console.log(query);
        console.log(decodeURIComponent(query.state as string));
        const [ provider, env ] = (query.state as string).split(',');
        let atUrl:string;
        switch (provider) {
            case Provider.github:
                atUrl = oauthProviders.github.accessToken;
                break;
            default:
                res.writeHead(200);
                res.end(`
                    <p>unknow provider</p>
                `);
                return;
                // return next(new Error('unknow provider'));
        }
        atUrl = atUrl.replace('CODE', query.code as string).replace('REDIRECT_URI', encodeURI(config.oauthUrl + 'callback'));
        let oauthInfo:any = await request(
            atUrl,
            provider === Provider.github
            ? 'POST' : 'GET'
        );

        res.writeHead(200);
        res.end(`
            <p>${JSON.stringify(oauthInfo)}</p>
        `);
        // res.writeHead(302, {'Location': backendUrl[env] + `?oauthInfo=${JSON.stringify(oauthInfo)}&state=${query.state}`});
        // res.end();
    },
    '/health_check': (_, res) => {
        res.writeHead(200);
        res.end();
    },
    '/test': (req, res, next) => {
        const query = querystring.parse(url.parse(req.url!).query!)
        res.writeHead(200);
        res.end(`
            <!DOCTYPE html>
                <script>
                    function openOauth() {
                        var oauthWindow = window.open('${config.oauthUrl}entry?env=${Env.staging}&provider=${query.provider || Provider.github}',
                        'oauth_page',
                        'height=580, width=600, top=200, left=300, toolbar=no, menubar=no, scrollbars=no, resizable=no,location=no, status=no'
                        );
                        var listener = (e) => {
                            console.log('in listener')
                            console.log(e)
                            window.removeEventListener('message', listener)
                        };
                        window.addEventListener('message', listener, false);
                    }
                </script>
            <button onclick="openOauth()">
                click to login
            </button>
        `);
    },
    '/getUser': async (req, res, next) => {
        const query = querystring.parse(url.parse(req.url!).query!)
        const { provider, access_token } = query;
        const base = oauthProviders[provider as string];
        if (!base) {
            return next(new Error('Unknow provider'));
        }
        const result = await request(base.getUser, 'GET', {
            'Authorization': `token ${access_token}`,
            'User-Agent': `node.js@test3207`,
        });
        res.writeHead(200);
        res.end(result);
    },
};

const request = async (targetUrl:string, method='GET', headers?:http.OutgoingHttpHeaders) => {
    console.log('requesting:', targetUrl);
    return await new Promise((resolve, reject) => {
        try {
            https.request(encodeURI(targetUrl), { method, headers }, (oauthRes) => {
                const chunkList:any[] = [];
                oauthRes.on('error', (e) => {
                    reject(e);
                });
                oauthRes.on('data', (chunk) => {
                    chunkList.push(chunk);
                });
                oauthRes.on('end', () => {
                    resolve(Buffer.concat(chunkList).toString());
                });
            }).on('error', (e) => {
                reject(e);
            }).end();
        } catch (e) {
            reject(e);
        }
    })
}

http.createServer(async (req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} "${req.connection.remoteAddress}" "${req.headers['user-agent']}"`);
    if (!req.url) {
        res.writeHead(400);
        return res.end('url cannot be empty');
    }
    const { pathname } = url.parse(req.url!)!
    if (pathname) {
        const names = /^\/[\w|_|-|\n]*/.exec(pathname);
        if (!names) {
            fail();
            return;
        }
        const route = names[0];
        const routeHandler = routes[route];
        if (routeHandler) {
            try {
                return routeHandler(req, res, fail);
            } catch (e) {
                fail(e as Error);
            }
        } else {
            fail(new Error('No such content'));
        }
    } else {
        fail();
    }
    function fail (e?:Error) {
        res.writeHead(404);
        res.end(e ? e.message : 'unknow error');
    }
}).listen(config.oauthPort);