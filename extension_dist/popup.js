const defaults={enabled:true,targetLanguage:'vi',pacing:'natural',fontSize:30,textColor:'#ffffff',backgroundOpacity:72,position:'bottom',hideNativeCaptions:true};
const ids=Object.keys(defaults);const $=id=>document.getElementById(id);

function loadSettings(){chrome.storage.sync.get(defaults,settings=>{for(const id of ids){const el=$(id);if(el.type==='checkbox')el.checked=settings[id];else el.value=settings[id]}updateValues()})}
function updateValues(){$('fontSizeValue').textContent=`${$('fontSize').value}px`;$('opacityValue').textContent=`${$('backgroundOpacity').value}%`}
function saveSetting(event){const el=event.target;let value=el.type==='checkbox'?el.checked:el.value;if(el.type==='range')value=Number(value);chrome.storage.sync.set({[el.id]:value});updateValues()}
async function checkBackend(){const button=$('backend-status');button.className='backend checking';button.textContent='● Đang kiểm tra backend...';const response=await chrome.runtime.sendMessage({type:'health'});if(response?.ok){button.className='backend online';button.textContent='● Backend local đang chạy';$('backend-help').classList.add('hidden')}else{button.className='backend offline';button.textContent='● Backend local chưa chạy';$('backend-help').classList.remove('hidden')}}
async function sendToVideo(forceRefresh){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!tab.url?.includes('youtube.com/')){$('message').textContent='Hãy mở một video YouTube trước.';return}try{await chrome.tabs.sendMessage(tab.id,{type:'reload-subtitles',forceRefresh});$('message').textContent=forceRefresh?'Đang dịch lại video...':'Đã áp dụng cài đặt.'}catch{$('message').textContent='Tải lại trang YouTube rồi thử lại.'}}

for(const id of ids)$(id).addEventListener('input',saveSetting);
$('backend-status').addEventListener('click',checkBackend);
$('apply').addEventListener('click',()=>sendToVideo(false));
$('refresh').addEventListener('click',()=>sendToVideo(true));
loadSettings();checkBackend();
