import jwt from 'jsonwebtoken';

function secret(){const s=process.env.JWT_SECRET;if(!s||s.length<32)throw new Error('JWT_SECRET must be configured.');return s;}
export function createMediaPreviewToken(assetId:string,preset:string,format:string){return jwt.sign({assetId,preset,format,scope:'media-preview'},secret(),{expiresIn:'10m',issuer:'vachana-kranti-api',audience:'vachana-media'});}
export function verifyMediaPreviewToken(token:string,assetId:string,preset:string,format:string){try{const p=jwt.verify(token,secret(),{issuer:'vachana-kranti-api',audience:'vachana-media'}) as jwt.JwtPayload;return p.assetId===assetId&&p.preset===preset&&p.format===format&&p.scope==='media-preview';}catch{return false;}}
