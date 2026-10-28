/* Google Maps display only. Configuration is never part of travel data. */
(function(root){
 'use strict';
 const validPosition=p=>p&&typeof p.lat==='number'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&typeof p.lng==='number'&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180;
 let scriptPromise;
 function loadGoogle(config){
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
   let ended=false;
   const finish=ok=>{if(ended)return;ended=true;clearTimeout(timer);root.__zhuhaiMapsReady=()=>{};ok?resolve(root.google):reject(new Error('Google Maps unavailable'));};
   const timer=setTimeout(()=>finish(false),15000);
   root.__zhuhaiMapsReady=()=>finish(!!root.google?.maps?.importLibrary);
   root.gm_authFailure=()=>{finish(false);root.dispatchEvent(new Event('zhuhai-map-auth-error'));};
   const script=document.createElement('script');script.id='zhuhai-google-maps-script';script.async=true;
   const params=new URLSearchParams({key:config.apiKey,loading:'async',callback:'__zhuhaiMapsReady',v:'weekly',language:'th',region:'CN'});
   script.src='https://maps.googleapis.com/maps/api/js?'+params;script.onerror=()=>finish(false);document.head.append(script);
  });
  return scriptPromise;
 }
 class Controller{
  constructor({canvas,status,onSelect,loadConfig,loadApi=loadGoogle}){
   Object.assign(this,{canvas,status,onSelect,loadApi});this.model={dayKey:'',entries:[]};this.markers=new Map();this.map=null;this.configPromise=null;this.apiPromise=null;this.config=null;this.error=false;this.lastDay=null;this.lastGeometry=null;this.visible=false;this.selectedUid=null;this.loadConfig=loadConfig||(async()=>{const r=await fetch('./maps-config.local.json',{cache:'no-store'});if(!r.ok)return null;return r.json();});
   root.addEventListener?.('zhuhai-map-auth-error',()=>this.fail());
  }
  message(text){this.status.textContent=text;this.status.hidden=false;}
  fail(){this.error=true;this.canvas.hidden=true;this.message('แผนที่โหลดไม่ได้ · ตรวจสอบ API key, billing, map ID หรือการเชื่อมต่อ แล้ว reload หน้า แผนเที่ยวยังใช้งานได้');}
  update(model){this.model=model;this.selectedUid=model.selectedUid||null;if(this.map&&!this.error)this.reconcile();if(this.visible)void this.ensure();}
  setVisible(visible){this.visible=visible;if(visible){if(this.map&&!this.error)this.reconcile();void this.ensure();}}
  async ensure(){
   if(!this.visible||this.error)return;
   try{
    if(!this.configPromise)this.configPromise=Promise.resolve().then(()=>this.loadConfig()).catch(()=>null);
    this.config=await this.configPromise;
    if(!this.visible||this.error)return;
    if(!this.config||typeof this.config.apiKey!=='string'||!this.config.apiKey.trim()||typeof this.config.mapId!=='string'||!this.config.mapId.trim()||this.config.mapId==='DEMO_MAP_ID'){
     this.canvas.hidden=true;this.message('ยังไม่ได้ตั้งค่า Google Maps · ต้องมี browser API key และ map ID ดู MAPS_SETUP.md');return;
    }
    if(!this.model.entries.some(e=>validPosition(e.position))&&!this.map){this.canvas.hidden=true;this.message('ยังไม่มีพิกัดในวันนี้ · กรอก Latitude / Longitude ที่ตรวจสอบแล้ว จึงจะโหลดแผนที่');return;}
    if(!this.apiPromise){
     this.message('กำลังโหลด Google Maps…');
     this.apiPromise=this.loadApi(this.config).then(async google=>{
      const [maps,marker]=await Promise.all([google.maps.importLibrary('maps'),google.maps.importLibrary('marker')]);
      if(this.error)return;this.api={...maps,...marker,LatLngBounds:google.maps.LatLngBounds};
     }).catch(()=>this.fail());
    }
    await this.apiPromise;if(!this.api||!this.visible||this.error)return;
    if(!this.map){const first=this.model.entries.find(e=>validPosition(e.position));if(!first)return;this.canvas.hidden=false;this.map=new this.api.Map(this.canvas,{mapId:this.config.mapId,center:first.position,zoom:13,streetViewControl:false,mapTypeControl:false,fullscreenControl:true,gestureHandling:'cooperative',clickableIcons:false});}
    this.canvas.hidden=false;this.reconcile();
   }catch(_){this.fail();}
  }
  reconcile(){
   if(!this.map||this.error)return;
   const entries=this.model.entries.filter(e=>validPosition(e.position)),wanted=new Set(entries.map(e=>e.uid));
   for(const [uid,item]of this.markers)if(!wanted.has(uid)){item.marker.map=null;this.markers.delete(uid);}
   for(const entry of entries){
    let item=this.markers.get(entry.uid);
    if(!item){const pin=new this.api.PinElement({glyphText:String(entry.number),glyphColor:'#fff',background:'#352579',borderColor:'#352579',scale:1.2});const marker=new this.api.AdvancedMarkerElement({map:this.map,position:entry.position,title:entry.number+'. '+entry.name,gmpClickable:true});marker.append(pin);marker.addEventListener('gmp-click',()=>this.onSelect(entry.uid));item={marker,pin};this.markers.set(entry.uid,item);}
    item.marker.position=entry.position;item.marker.title=entry.number+'. '+entry.name;item.pin.glyphText=String(entry.number);
   }
   const geometry=JSON.stringify(entries.map(e=>[e.uid,e.position.lat,e.position.lng]));
   // Never fit a hidden map or reset the camera for prices, FX, or selection alone.
   if(this.visible&&(this.lastDay!==this.model.dayKey||this.lastGeometry!==geometry)){
    if(entries.length){const positions=new Set(entries.map(e=>e.position.lat+','+e.position.lng));if(positions.size===1){this.map.setCenter(entries[0].position);this.map.setZoom(15);}else{const bounds=new this.api.LatLngBounds();entries.forEach(e=>bounds.extend(e.position));this.map.fitBounds(bounds,48);}}
    this.lastDay=this.model.dayKey;this.lastGeometry=geometry;
   }
   if(entries.length){this.status.hidden=true;}else this.message('วันนี้ยังไม่มีจุดที่มีพิกัด · ไม่มีหมุดจากวันก่อนแสดงอยู่');
   this.highlight();
  }
  select(uid,{pan=true}={}){this.selectedUid=uid;this.highlight();const item=this.markers.get(uid);if(pan&&item&&this.visible&&!this.error)this.map.panTo(item.marker.position);}
  highlight(){for(const [uid,item]of this.markers){const chosen=uid===this.selectedUid;item.marker.zIndex=chosen?1000:1;item.pin.background=chosen?'#ef4968':'#352579';item.pin.borderColor=chosen?'#ef4968':'#352579';item.pin.scale=chosen?1.4:1.2;}}
 }
 root.ZhuhaiMap={Controller,validPosition};
})(globalThis);
