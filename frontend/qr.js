// Generador local de QR Model 2, nivel L, versión 10. No envía el token a terceros.
const SIZE=57,DATA_CODEWORDS=274,EC_PER_BLOCK=18,BLOCK_LENGTHS=[68,68,69,69];
const multiply=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((y>>>i)&1)*x;}return z;};
function appendBits(out,value,length){for(let i=length-1;i>=0;i--)out.push((value>>>i)&1);}
function reedSolomon(data){let generator=[1];for(let i=0;i<EC_PER_BLOCK;i++){const next=Array(generator.length+1).fill(0),root=(()=>{let n=1;for(let k=0;k<i;k++)n=multiply(n,2);return n})();for(let j=0;j<generator.length;j++){next[j]^=generator[j];next[j+1]^=multiply(generator[j],root);}generator=next;}const result=[...data,...Array(EC_PER_BLOCK).fill(0)];for(let i=0;i<data.length;i++){const factor=result[i];for(let j=0;j<generator.length;j++)result[i+j]^=multiply(generator[j],factor);}return result.slice(-EC_PER_BLOCK);}
function drawFinder(matrix,reserved,cx,cy){for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=SIZE||y>=SIZE)continue;reserved[y][x]=true;const d=Math.max(Math.abs(dx-3),Math.abs(dy-3));matrix[y][x]=d!==2&&d!==4;}}
function drawAlignment(matrix,reserved,cx,cy){for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=cx+dx,y=cy+dy;reserved[y][x]=true;matrix[y][x]=Math.max(Math.abs(dx),Math.abs(dy))!==1;}}
function bchRemainder(value,poly){let v=value;const degree=x=>31-Math.clz32(x);while(degree(v)>=degree(poly))v^=poly<<(degree(v)-degree(poly));return v;}
function createMatrix(text){
  const bytes=Array.from(new TextEncoder().encode(text));if(bytes.length>271)throw new Error('El contenido excede la capacidad del QR.');
  const bits=[];appendBits(bits,4,4);appendBits(bits,bytes.length,16);for(const byte of bytes)appendBits(bits,byte,8);for(let i=0;i<Math.min(4,DATA_CODEWORDS*8-bits.length);i++)bits.push(0);while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|bits[i+j];data.push(value);}for(let pad=0;data.length<DATA_CODEWORDS;pad++)data.push(pad%2===0?0xec:0x11);
  const blocks=[];let offset=0;for(const length of BLOCK_LENGTHS){const chunk=data.slice(offset,offset+length);offset+=length;blocks.push({data:chunk,ec:reedSolomon(chunk)});}
  const codewords=[];for(let i=0;i<69;i++)for(const block of blocks)if(i<block.data.length)codewords.push(block.data[i]);for(let i=0;i<EC_PER_BLOCK;i++)for(const block of blocks)codewords.push(block.ec[i]);
  const matrix=Array.from({length:SIZE},()=>Array(SIZE).fill(false)),reserved=Array.from({length:SIZE},()=>Array(SIZE).fill(false));
  drawFinder(matrix,reserved,3,3);drawFinder(matrix,reserved,SIZE-4,3);drawFinder(matrix,reserved,3,SIZE-4);
  for(let i=8;i<SIZE-8;i++){reserved[6][i]=reserved[i][6]=true;matrix[6][i]=matrix[i][6]=i%2===0;}
  const align=[6,28,50];for(let yi=0;yi<align.length;yi++)for(let xi=0;xi<align.length;xi++)if(!((yi===0&&xi===0)||(yi===0&&xi===align.length-1)||(yi===align.length-1&&xi===0)))drawAlignment(matrix,reserved,align[xi],align[yi]);
  const formatData=8;const format=(formatData<<10)|bchRemainder(formatData<<10,0x537),masked=format^0x5412;
  const bit=(n)=>((masked>>>n)&1)!==0;
  for(let i=0;i<=5;i++){reserved[i][8]=true;matrix[i][8]=bit(i);}reserved[7][8]=true;matrix[7][8]=bit(6);reserved[8][8]=true;matrix[8][8]=bit(7);reserved[8][7]=true;matrix[8][7]=bit(8);for(let i=9;i<15;i++){reserved[8][14-i]=true;matrix[8][14-i]=bit(i);}
  for(let i=0;i<8;i++){reserved[8][SIZE-1-i]=true;matrix[8][SIZE-1-i]=bit(i);}for(let i=8;i<15;i++){reserved[SIZE-15+i][8]=true;matrix[SIZE-15+i][8]=bit(i);}reserved[SIZE-8][8]=true;matrix[SIZE-8][8]=true;
  const version=10,versionBits=(version<<12)|bchRemainder(version<<12,0x1f25);for(let i=0;i<18;i++){const dark=((versionBits>>>i)&1)!==0;const a=SIZE-11+i%3,b=Math.floor(i/3);reserved[b][a]=reserved[a][b]=true;matrix[b][a]=matrix[a][b]=dark;}
  let bitIndex=0,up=true;for(let right=SIZE-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<SIZE;vert++){const y=up?SIZE-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(reserved[y][x])continue;const value=bitIndex<codewords.length*8?((codewords[bitIndex>>>3]>>>(7-(bitIndex&7)))&1)!==0:false;matrix[y][x]=value^((x+y)%2===0);bitIndex++;}}up=!up;}
  return matrix;
}
export function qrSvg(text){const matrix=createMatrix(text),quiet=4,size=SIZE+quiet*2;let path='';for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(matrix[y][x])path+=`M${x+quiet} ${y+quiet}h1v1h-1z`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#102e25"/></svg>`;}
