// Check dimensions before decoding compressed images. Only the upload formats
// already accepted by Admit Strategy are supported here.
export function photoDimensions(buffer){
 const b=new Uint8Array(buffer),v=new DataView(b.buffer,b.byteOffset,b.byteLength),tag=(i,n)=>String.fromCharCode(...b.slice(i,i+n));let width,height;
 if(b.length>=24&&b[0]===137&&tag(1,3)==='PNG'&&tag(12,4)==='IHDR'){width=v.getUint32(16);height=v.getUint32(20);}
 else if(b.length>4&&b[0]===255&&b[1]===216){
  for(let i=2;i+4<=b.length;){
   if(b[i++]!==255)break;while(b[i]===255)i++;const marker=b[i++];if(marker===217||marker===218)break;
   const size=v.getUint16(i);if(size<2||i+size>b.length)break;
   if([192,193,194].includes(marker)&&size>=8){height=v.getUint16(i+3);width=v.getUint16(i+5);break;}i+=size;
  }
 }else if(b.length>=30&&tag(0,4)==='RIFF'&&tag(8,4)==='WEBP'){
  for(let i=12;i+8<=b.length;){const kind=tag(i,4),size=v.getUint32(i+4,true),p=i+8;if(p+size>b.length)break;
   if(kind==='VP8X'&&size>=10){width=1+b[p+4]+b[p+5]*256+b[p+6]*65536;height=1+b[p+7]+b[p+8]*256+b[p+9]*65536;break;}
   if(kind==='VP8 '&&size>=10&&b[p+3]===157&&b[p+4]===1&&b[p+5]===42){width=v.getUint16(p+6,true)&16383;height=v.getUint16(p+8,true)&16383;break;}
   if(kind==='VP8L'&&size>=5&&b[p]===47){const bits=v.getUint32(p+1,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;break;}
   i=p+size+(size%2);
  }
 }
 if(!width||!height)throw new Error('This image format could not be read. Save a copy as JPEG or PNG and try again.');
 if(width*height>24000000||Math.max(width,height)>12000)throw new Error('This photo is too large. Crop it to one page or use an image under 24 megapixels.');
 return {width,height};
}
