/* Wait only for our native pan presentation; preserve original input FIFO. */
(function(global){
  'use strict';
  function createGate({send,ready,schedule,clearSchedule,now,onAbort=()=>{}}){
    let queue=[],timer=null,started=0;
    function cancel(){if(timer!==null)clearSchedule(timer);timer=null;queue=[];started=0;}
    function pump(){
      timer=null;if(!queue.length)return;
      if(now()-started>800){cancel();onAbort();return;}
      if(!ready()){timer=schedule(pump,8);return;}
      const pending=queue;queue=[];started=0;for(const action of pending)send(action);
    }
    function dispatch(action){
      // Camera pulses themselves must reach the original UI camera immediately;
      // only later pointer/button/query events wait for their presented receipt.
      if(action.type==='pan'){send(action);return;}
      if(!queue.length&&ready()){send(action);return;}
      if(!queue.length)started=now();
      const last=queue[queue.length-1];
      if(last&&last.type===action.type&&['move','worldMove'].includes(action.type))queue[queue.length-1]=action;
      else queue.push(action);
      if(queue.length>256){cancel();onAbort();return;}
      if(timer===null)timer=schedule(pump,8);
    }
    return {dispatch,cancel,debug:()=>({queueLength:queue.length,waiting:queue.length>0})};
  }
  const api={createGate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.WarcraftCameraInputGateV15=api;
})(typeof window!=='undefined'?window:globalThis);
