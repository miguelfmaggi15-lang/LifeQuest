import { env } from "cloudflare:workers";

type RoomRow = { id: number; code: string; state_json: string; version: number };
type Player = Record<string, any>;
type State = { room: Record<string, any>; players: Player[]; game: any; feed: any[]; nextFeedId: number };

const careers = [
  { id: 1, name: "Desenvolvedor", salary: 12000, bonus_desc: "Bonus +4000 em casas SORTE", color: "#0984E3", icon: "D" },
  { id: 2, name: "Medica", salary: 15000, bonus_desc: "Paga metade em eventos negativos", color: "#E84393", icon: "M" },
  { id: 3, name: "Designer", salary: 10000, bonus_desc: "Recebe +2000 em PAYDAY", color: "#6C5CE7", icon: "D" },
  { id: 4, name: "Engenheira", salary: 13000, bonus_desc: "Desconto de 3000 em casas", color: "#00B894", icon: "E" },
  { id: 5, name: "Chef", salary: 9000, bonus_desc: "Ganha 3000 extra em FAMILIA", color: "#E17055", icon: "C" },
  { id: 6, name: "Professora", salary: 8000, bonus_desc: "Estudo custa metade", color: "#B7791F", icon: "P" },
  { id: 7, name: "Fotografa", salary: 8500, bonus_desc: "SORTE rende +1500 extra", color: "#00CEC9", icon: "F" },
  { id: 8, name: "Empresaria", salary: 11000, bonus_desc: "Investimentos rendem +50%", color: "#D63031", icon: "E" },
];
const houses = [
  { id: 1, name: "Chale Aconchego", price: 30000, sell_value: 36000, icon: "H" },
  { id: 2, name: "Apartamento Mirante", price: 55000, sell_value: 66000, icon: "A" },
  { id: 3, name: "Casa Jardim Luz", price: 80000, sell_value: 98000, icon: "C" },
  { id: 4, name: "Mansao Horizonte", price: 120000, sell_value: 150000, icon: "M" },
];
const cards = ([
  ["positivo", "Projeto brilhou", "Seu projeto foi um sucesso. Receba $20.000.", 20000],
  ["positivo", "Freela premiado", "Um cliente amou seu trabalho. Receba $12.000.", 12000],
  ["positivo", "Bonus criativo", "Sua ideia economizou tempo. Receba $8.000.", 8000],
  ["positivo", "Feira de talentos", "Voce venceu uma mostra local. Receba $10.000.", 10000],
  ["negativo", "Manutencao inesperada", "O carro quebrou. Pague $8.000.", -8000],
  ["negativo", "Conta alta de luz", "A fatura veio salgada. Pague $5.000.", -5000],
  ["negativo", "Multa distraida", "Estacionou errado. Pague $4.000.", -4000],
  ["negativo", "Celular quebrou", "Tela trincou. Pague $6.000.", -6000],
  ["sorte", "Sorte grande", "Dia de sorte! Receba $15.000.", 15000],
  ["sorte", "Achado na rua", "Voce devolveu carteira e ganhou recompensa $5.000.", 5000],
  ["sorte", "Rifa da sorte", "Ganhou a rifa do bairro. Receba $9.000.", 9000],
  ["positivo", "Promocao relampago", "Chefe reconheceu seu esforco. Receba $14.000.", 14000],
  ["negativo", "Chuva estragou tudo", "Evento cancelou. Pague $7.000.", -7000],
  ["positivo", "Curso concluido", "Certificado novo rendeu bonus. Receba $7.000.", 7000],
  ["sorte", "Moeda da sorte", "Cara ou coroa a seu favor. Receba $6.000.", 6000],
  ["negativo", "Assinatura esquecida", "Anuidade cobrada. Pague $3.000.", -3000],
] as [string, string, string, number][]).map((c, i) => ({ id: i + 1, kind: c[0], title: c[1], description: c[2], effect_money: c[3], extra: "" }));
const lifeTiles: Record<number, [string, string]> = {
  0:["inicio","Inicio da Vida"],1:["evento","Evento surpresa"],2:["carreira","Escolha de Carreira"],3:["payday","Dia de pagamento"],4:["evento","Evento surpresa"],5:["payday","Dia de pagamento"],6:["familia","Familia cresce"],7:["carreira","Nova oportunidade"],8:["imposto","Impostos"],9:["evento","Evento surpresa"],10:["escolha","Estudar ou Trabalhar?"],11:["payday","Dia de pagamento"],12:["sorte","Sorte!"],13:["casa","Corretora de imoveis"],14:["carreira","Mudanca de carreira"],15:["evento","Reviravolta"],16:["familia","Casamento!"],17:["payday","Dia de pagamento"],18:["imposto","Impostos"],19:["casa","Corretora de imoveis"],20:["evento","Evento surpresa"],21:["escolha","Investir ou poupar?"],22:["payday","Dia de pagamento"],23:["familia","Chegou um bebe!"],24:["sorte","Sorte!"],25:["carreira","Proposta irrecusavel"],26:["payday","Dia de pagamento"],27:["evento","Reviravolta"],28:["casa","Corretora de imoveis"],29:["imposto","Impostos"],30:["familia","Reuniao de familia"],31:["payday","Dia de pagamento"],32:["evento","Evento surpresa"],33:["sorte","Grande sorte!"],34:["familia","Familia cresce"],35:["casa","Corretora de bairro"],36:["imposto","Impostos"],37:["payday","Dia de pagamento"],38:["evento","Evento surpresa"],39:["sorte","Marco da jornada!"],40:["carreira","Nova fase"],41:["payday","Dia de pagamento"],42:["evento","Reviravolta"],43:["familia","Chegou um bebe!"],44:["escolha","Investir ou poupar?"],45:["payday","Dia de pagamento"],46:["casa","Casa dos sonhos"],47:["imposto","Impostos"],48:["sorte","Sorte grande!"],49:["familia","Familia cresce"],50:["carreira","Auge da carreira"],51:["payday","Dia de pagamento"],52:["evento","Reviravolta"],53:["casa","Imoveis premium"],54:["imposto","Impostos"],55:["sorte","Sorte!"],56:["familia","Reuniao de familia"],57:["payday","Dia de pagamento"],58:["evento","Ultimo evento"],59:["aposentadoria","Aposentadoria"]
};
const monoTiles = ([
  ["Partida","go",null,0,0,0,0],["Vila Aurora","prop","vilas",600,50,300,300],["Cofre Comunitário","cofre",null,0,0,0,0],["Vila Brisa","prop","vilas",800,60,400,400],["Imposto Verde","tax",null,1000,0,0,0],["Vila Sol","prop","vilas",1000,80,500,500],["Estação Norte","station",null,2000,250,0,1000],["Bairro Lírio","prop","bairros",1200,100,600,600],["Sorte Grande","sorte",null,0,0,0,0],["Bairro Ipê","prop","bairros",1400,110,700,700],["Visita na Prisão","stop",null,0,0,0,0],["Bairro Jasmim","prop","bairros",1600,130,800,800],["Luz e Cia","utility",null,1500,300,0,750],["Avenida Central","prop","avenidas",1800,150,900,900],["Avenida Parque","prop","avenidas",2000,160,1000,1000],["Estação Sul","station",null,2000,250,0,1000],["Avenida Lago","prop","avenidas",2200,180,1100,1100],["Cofre da Praça","cofre",null,0,0,0,0],["Rua do Comércio","prop","centro",2400,200,1200,1200],["Rua das Flores","prop","centro",2600,220,1300,1300],["Estacionamento Livre","parking",null,0,0,0,0],["Rua do Porto","prop","centro",2800,240,1400,1400],["Sorte do Bairro","sorte",null,0,0,0,0],["Orla Maré","prop","orla",3000,260,1500,1500],["Orla Sol","prop","orla",3400,300,1700,1700],["Água e Vapor","utility",null,1500,300,0,750],["Orla Palms","prop","orla",3800,340,1900,1900],["Vá para a Prisão","jail",null,0,0,0,0],["Metrópole Alfa","prop","metro",4000,380,2000,2000],["Metrópole Beta","prop","metro",4400,420,2200,2200],["Taxa de Luxo","tax",null,1000,0,0,0],["Metrópole Gama","prop","metro",4800,480,2400,2400]
] as [string, string, string | null, number, number, number, number][]).map((t,i)=>({tile:i,name:t[0],kind:t[1],color_group:t[2],price:t[3],rent0:t[4],house_cost:t[5],mortgage:t[6],text:""}));

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const db = () => { if (!env.DB) throw new ApiError("Banco temporariamente indisponível.", 503); return env.DB; };
const json = (body: any, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function fail(message: string, status = 400): never { throw new ApiError(message, status); }
const token = () => crypto.randomUUID().replaceAll("-", "");
const int = (v: any, fallback = 0) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback;
const randomInt = (max: number) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % max; };
const code = () => Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)]).join("");
const stamp = () => new Date().toISOString();
const fmt = (n: number) => "$" + Math.abs(n).toLocaleString("pt-BR");
function addLog(s: State, playerId: number | null, turn: number, type: string, value: number, position: number | null, description: string, animation?: Record<string, any>) {
  const p = s.players.find(x => x.id === playerId);
  s.feed.push({ id: s.nextFeedId++, game_id: s.game?.id, player_id: playerId, turn_number: turn, action_type: type, value, position, description: description.slice(0,250), pname: p?.name ?? null, created_at: stamp(), ...(animation ? { animation } : {}) });
  s.feed = s.feed.slice(-25);
}
async function getRoomByCode(c: string) {
  const row = await db().prepare("SELECT id, code, state_json, version FROM rooms WHERE code = ?").bind(c).first<RoomRow>();
  if (!row) fail("Sala não encontrada.", 404);
  return { row, state: JSON.parse(row.state_json) as State };
}
async function getRoomByToken(t: string) {
  const q = await db().prepare("SELECT r.id, r.code, r.state_json, r.version, ps.player_id FROM player_sessions ps JOIN rooms r ON r.id = ps.room_id WHERE ps.token = ?").bind(t).first<any>();
  if (!q) fail("Sessão inválida. Entre na sala de novo.", 401);
  const state = JSON.parse(q.state_json) as State;
  const player = state.players.find(p => p.id === q.player_id);
  if (!player) fail("Sessão expirada. Entre novamente.", 401);
  return { row: q as RoomRow, state, player };
}
async function save(row: RoomRow, s: State) {
  s.room.state_version = row.version + 1;
  const result = await db().prepare("UPDATE rooms SET status = ?, game_type = ?, board_size = ?, state_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
    .bind(s.room.status, s.room.game_type, s.room.board_size, JSON.stringify(s), stamp(), row.id, row.version).run();
  if (!result.meta.changes) fail("A sala foi atualizada por outro jogador. Tente de novo.", 409);
}
function roomPayload(s: State) { return { room: s.room, players: s.players.map(({token: _t,...p})=>p) }; }
function gamePayload(s: State, meId?: number) {
  return { game: s.game, players: s.game?.players ?? [], feed: s.feed, room: s.room, me_id: meId, careers, houses,
    ...(s.room.game_type === "mono" ? { tiles: monoTiles, deeds: s.game?.deeds ?? [], offers: s.game?.offers ?? [], pending: s.game?.pending_json ?? null } : {}) };
}
function connected(s: State) { return s.players.filter(p=>p.is_connected===1).sort((a,b)=>a.id-b.id); }
function ensureHost(s: State) {
  let host=s.players.find(p=>p.id===s.room.host_player_id && p.is_connected===1);
  if(!host) host=connected(s)[0];
  s.players.forEach(p=>p.is_host=p.id===host?.id?1:0);
  s.room.host_player_id=host?.id ?? null;
}
function currentGamePlayer(s: State, id: number) { return s.game?.players?.find((p:Player)=>p.player_id===id); }
function needPlayer(s: State, id: number) { const p=s.players.find(x=>x.id===id); if(!p) fail("Você não está nesta sala.",403); return p; }
function needHost(p: Player) { if(p.is_host!==1) fail("Só o anfitrião pode fazer isso.",403); }
function needTurn(s: State,p: Player) { if(s.game?.current_player_id!==p.id) fail("Aguarde o turno do jogador atual.",403); }
function lifePayday(s:State,gp:Player,p:Player,turn:number) { let gain=gp.salary>0?gp.salary:2000; if(career(gp)?.name==="Designer")gain+=2000; gp.money+=gain; addLog(s,p.id,turn,"money",gain,gp.position,`${p.name} recebeu salário ${fmt(gain)}.`); return gain; }
function career(gp:Player) { return careers.find(c=>c.id===gp.career_id); }
function finishPlayer(s:State,gp:Player) {
  gp.finished=1; gp.finish_order=s.game.players.filter((x:Player)=>x.finished).length+1;
  gp.final_wealth=gp.money+(houses.find(h=>h.id===gp.house_id)?.sell_value??0)+gp.children_count*10000+(gp.spouse?5000:0)+([15000,8000,4000][gp.finish_order-1]??0);
}
function advanceLife(s:State) {
  const active=s.game.players.filter((p:Player)=>!p.finished).sort((a:Player,b:Player)=>a.player_id-b.player_id);
  if(!active.length){s.game.status="finished";s.game.winner_player_id=[...s.game.players].sort((a:Player,b:Player)=>b.final_wealth-a.final_wealth)[0]?.player_id??null;s.game.current_player_id=null;s.room.status="finished";s.room.finished_at=stamp();s.room.current_turn_player_id=null;return;}
  const i=active.findIndex((p:Player)=>p.player_id===s.game.current_player_id), next=active[(i+1+active.length)%active.length];
  s.game.current_player_id=next.player_id;s.game.turn_index++;s.game.total_turns++;s.room.current_turn_player_id=next.player_id;s.room.turn_number++;
}
function startLife(s:State) {
  const list=connected(s); if(list.length<2)fail("Chame pelo menos 2 jogadores para começar.");
  const now=stamp();
  s.game={id:Date.now(),room_id:s.room.id,status:"playing",turn_index:0,current_player_id:list[0].id,winner_player_id:null,total_turns:0,board_size:s.room.board_size,game_type:"life",started_at:now,finished_at:null,
    players:list.slice(0,4).map(p=>({id:p.id,game_id:Date.now(),player_id:p.id,money:20000,position:0,career_id:null,salary:0,studied:0,children_count:0,spouse:0,car_seats:4,house_id:null,finished:0,finish_order:null,final_wealth:null,pending_type:null,pending_data:null,last_spin:null,name:p.name,avatar_color:p.avatar_color,avatar_emoji:p.avatar_emoji,is_host:p.is_host,is_connected:p.is_connected,career_name:null,house_name:null}))};
  s.game.players.forEach((p:Player)=>p.game_id=s.game.id);s.room.status="playing";s.room.current_turn_player_id=list[0].id;s.room.turn_number=1;s.room.started_at=now;s.room.finished_at=null;s.feed=[];s.nextFeedId=1;addLog(s,null,0,"system",0,0,"Partida iniciada! Boa jornada!");
}
function monoStart(s:State) {
  const list=connected(s);if(list.length<2)fail("Chame pelo menos 2 jogadores para começar.");const now=stamp();const gid=Date.now();
  s.game={id:gid,room_id:s.room.id,status:"playing",round:1,turn_index:0,current_player_id:list[0].id,winner_player_id:null,jackpot:500,pending_json:null,started_at:now,finished_at:null,
    players:list.slice(0,4).map(p=>({id:gid*10+p.id,game_id:gid,player_id:p.id,money:15000,position:0,in_jail:0,jail_free:0,bankrupt:0,last_dice:0,pending_type:null,pending_data:null,name:p.name,avatar_color:p.avatar_color,avatar_emoji:p.avatar_emoji,is_host:p.is_host,is_connected:p.is_connected,net_worth:15000})),deeds:monoTiles.filter(t=>["prop","station","utility"].includes(t.kind)).map(t=>({tile:t.tile,owner:null,houses:0,mortgaged:0,info:t})),offers:[]};
  s.room.status="playing";s.room.current_turn_player_id=list[0].id;s.room.turn_number=1;s.room.started_at=now;s.room.finished_at=null;s.feed=[];s.nextFeedId=1;addLog(s,null,0,"system",0,0,"Partida do Banco Imobiliário iniciada!");
}
function monoAdvance(s:State){const alive=s.game.players.filter((p:Player)=>!p.bankrupt);if(!alive.length)return;const i=alive.findIndex((p:Player)=>p.player_id===s.game.current_player_id);const next=alive[(i+1+alive.length)%alive.length];if(i===alive.length-1)s.game.round++;s.game.current_player_id=next.player_id;s.game.turn_index++;s.room.current_turn_player_id=next.player_id;s.room.turn_number++;}
function monoNetWorth(s:State,p:Player){return p.money+s.game.deeds.filter((d:Player)=>d.owner===p.player_id).reduce((n:number,d:Player)=>n+(d.info.price||0)+(d.houses||0)*(d.info.house_cost||0),0);}
function monoPayload(s:State,meId?:number){if(s.game){s.game.players.forEach((p:Player)=>p.net_worth=monoNetWorth(s,p));}return {...gamePayload(s,meId),pending:s.game?.pending_json??null,tiles:monoTiles,deeds:s.game?.deeds??[],offers:s.game?.offers??[]};}
function monoLand(s:State,p:Player,gp:Player,dice:number,event:any){const tile=monoTiles[gp.position];event.tile_info=tile;event.text+=` ${p.name} foi para ${gp.position} (${tile.name}).`;
  if(["prop","station","utility"].includes(tile.kind)){const deed=s.game.deeds.find((d:Player)=>d.tile===gp.position);if(deed.owner==null){gp.pending_type="buy";gp.pending_data={tile:gp.position,price:tile.price};event.need_choice=true;event.choice_kind="buy";event.text+=` Comprar por ${fmt(tile.price)} ou abrir leilão?`;}
    else if(deed.owner!==p.id){const rent=tile.rent0*(deed.houses?1+deed.houses:1);const owner=s.game.players.find((x:Player)=>x.player_id===deed.owner);gp.money-=rent;if(owner)owner.money+=rent;event.loss=rent;event.text+=` Aluguel: ${fmt(rent)}.`;}
  }else if(tile.kind==="tax"){gp.money-=tile.price;s.game.jackpot+=tile.price;event.loss=tile.price;event.text+=` Taxa de ${fmt(tile.price)}.`;}
  else if(tile.kind==="parking"){gp.money+=s.game.jackpot;event.gain=s.game.jackpot;s.game.jackpot=500;event.text+=" Recebeu o jackpot!";}
  else if(tile.kind==="jail"){gp.position=10;gp.in_jail=3;event.text+=" Foi para a prisão.";}
  else if(tile.kind==="sorte"||tile.kind==="cofre"){const amount=(randomInt(5)-2)*500;gp.money+=amount;s.game.jackpot+=amount<0?-amount:0;event.gain=amount>0?amount:undefined;event.loss=amount<0?-amount:undefined;event.text+=amount>=0?` Ganhou ${fmt(amount)}.`:` Pagou ${fmt(-amount)}.`;}
}

async function dispatch(request:Request, path:string[]) {
  if(request.method==="OPTIONS")return new Response(null,{status:204});
  const u=new URL(request.url);let input:any={};if(request.method!=="GET"&&request.method!=="HEAD"){try{input=await request.json();}catch{input={};}}
  const action=String(input.action??u.searchParams.get("action")??"").toLowerCase();
  try {
    const endpoint=path.at(-1)??"";
    if(endpoint==="rank.php")return json({ok:true,winners:[],richest:[],total_games:0,games:[]});
    if(endpoint==="auth.php")return json({ok:false,error:"As partidas públicas usam apelido e não precisam de conta."},401);
    if(endpoint==="rooms.php"){
      if(action==="create"){
        const name=String(input.name??"").trim();if(!name||name.length>24)fail("Escolha um apelido de 1 a 24 letras.");
        let c="";for(let i=0;i<10;i++){const guess=code();if(!await db().prepare("SELECT id FROM rooms WHERE code=?").bind(guess).first()){c=guess;break;}}if(!c)fail("Tente novamente em instantes.",503);
        const playerToken=token(),pid=parseInt(crypto.randomUUID().slice(0,8),16),gameType=input.game_type==="mono"?"mono":"life",now=stamp();
        const rawColor=String(input.color??"#6C5CE7"),color=/^#[0-9a-fA-F]{6}$/.test(rawColor)?rawColor:"#6C5CE7";
        const player={id:pid,name,avatar_color:color,avatar_emoji:["R","B","G","Y"].includes(input.emoji)?input.emoji:"X",token:playerToken,is_host:1,is_connected:1,last_seen:now,created_at:now};
        const room={id:0,code:c,status:"lobby",max_players:4,host_player_id:pid,current_turn_player_id:null,turn_number:0,state_version:1,board_size:60,game_type:gameType,created_at:now,started_at:null,finished_at:null};
        const s:State={room,players:[player],game:null,feed:[],nextFeedId:1};const ins=await db().prepare("INSERT INTO rooms (code,status,game_type,board_size,state_json,version) VALUES (?, 'lobby', ?, 60, '{}', 1)").bind(c,gameType).run();room.id=Number(ins.meta.last_row_id);s.room.id=room.id;
        await db().batch([db().prepare("UPDATE rooms SET state_json=? WHERE id=?").bind(JSON.stringify(s),room.id),db().prepare("INSERT INTO player_sessions(token,room_id,player_id) VALUES(?,?,?)").bind(playerToken,room.id,pid)]);
        return json({ok:true,code:c,room_id:room.id,player_id:pid,token:playerToken,is_host:true,game_type:gameType});
      }
      if(action==="join"){
        const c=String(input.code??"").trim().toUpperCase(),name=String(input.name??"").trim();if(!/^[A-Z0-9]{6}$/.test(c))fail("Código inválido. Confira 6 letras/números.");if(!name||name.length>24)fail("Escolha um apelido de 1 a 24 letras.");
        const {row,state:s}=await getRoomByCode(c);if(s.room.status!=="lobby")fail("Partida já iniciada. Peça o código de uma sala no lobby.",409);
        const existing=s.players.find(p=>p.name.toLowerCase()===name.toLowerCase());if(existing){existing.is_connected=1;existing.last_seen=stamp();await save(row,s);return json({ok:true,reconnected:true,code:c,room_id:row.id,player_id:existing.id,token:existing.token,is_host:existing.is_host===1,game_type:s.room.game_type});}
        if(s.players.length>=4)fail("Sala cheia (máximo 4 jogadores).");
        const pid=parseInt(crypto.randomUUID().slice(0,8),16),playerToken=token(),palette=["#E84393","#0984E3","#00B894","#E17055"],emojis=["R","B","G","Y"],now=stamp();
        s.players.push({id:pid,name,avatar_color:palette[s.players.length],avatar_emoji:emojis[s.players.length],token:playerToken,is_host:0,is_connected:1,last_seen:now,created_at:now});ensureHost(s);await save(row,s);
        await db().prepare("INSERT INTO player_sessions(token,room_id,player_id) VALUES(?,?,?)").bind(playerToken,row.id,pid).run();return json({ok:true,code:c,room_id:row.id,player_id:pid,token:playerToken,is_host:false,game_type:s.room.game_type});
      }
      if(action==="state"){const {state}=await getRoomByCode(String(input.code??u.searchParams.get("code")??"").toUpperCase());return json({ok:true,...roomPayload(state)});}
      if(action==="size"){const {row,state:s,player}=await getRoomByToken(String(input.token??""));needHost(player);if(s.room.status!=="lobby")fail("Só vale no lobby.",409);s.room.board_size=int(input.size)===40?40:60;await save(row,s);return json({ok:true,board_size:s.room.board_size,room:s.room});}
      if(["heartbeat","reconnect","leave"].includes(action)){const {row,state:s,player}=await getRoomByToken(String(input.token??""));player.last_seen=stamp();player.is_connected=action==="leave"?0:1;ensureHost(s);await save(row,s);if(action==="leave")return json({ok:true});return json({ok:true,room:{code:s.room.code,status:s.room.status,state_version:s.room.state_version,game_type:s.room.game_type},me:{id:player.id,name:player.name,is_host:player.is_host,is_connected:player.is_connected},code:s.room.code,game_type:s.room.game_type});}
      fail("Ação desconhecida.",400);
    }
    if(!["game.php","mono.php"].includes(endpoint))fail("Rota não encontrada.",404);
    if(endpoint==="mono.php"&&action==="tiles")return json({ok:true,tiles:monoTiles});
    const {row,state:s,player}=await getRoomByToken(String(input.token??u.searchParams.get("token")??""));
    if(action==="start"||action==="new"){
      needHost(player);if(action==="new"&&s.room.status!=="finished")fail("A partida atual ainda está em andamento.",409);
      if(action==="new")s.room.status="lobby";
      if(s.room.game_type==="mono")monoStart(s);else startLife(s);
      await save(row,s);return json({ok:true,game_id:s.game.id,...(s.room.game_type==="mono"?monoPayload(s,player.id):gamePayload(s,player.id))});
    }
    if(!s.game){if(action==="state")return json({ok:true,game:null,players:[],feed:s.feed,room:s.room});fail("Nenhuma partida ativa.",404);}
    const gp=currentGamePlayer(s,player.id);if(!gp)fail("Você não está nesta partida.",403);
    if(action==="state")return json({ok:true,...(s.room.game_type==="mono"?monoPayload(s,player.id):gamePayload(s,player.id))});
    if(s.room.game_type==="life"){
      if(action==="spin"){
        needTurn(s,player);if(s.game.status!=="playing")fail("Partida encerrada.");if(gp.finished)fail("Você já se aposentou. Aguarde os outros.");if(gp.pending_type)fail("Resolva sua carta antes de girar.",409);
        const spin=1+randomInt(10),size=s.game.board_size,fin=size-1,from=gp.position;gp.position=Math.min(fin,from+spin);gp.last_spin=spin;const [type,label]=gp.position===39&&size===40?["aposentadoria","Chegada!"]:lifeTiles[gp.position]??["evento","Evento"];
        const turn=s.game.turn_index+1,event:any={tile:type,label,spin,pos:gp.position,need_choice:false};addLog(s,player.id,turn,"spin",spin,gp.position,`${player.name} girou ${spin} e foi para ${gp.position} (${label}).`, { from, to: gp.position, spin });
        const cn=career(gp)?.name;
        if(type==="payday"){event.gain=lifePayday(s,gp,player,turn);event.text=`Dia de pagamento! Você recebeu ${fmt(event.gain)}.`;}
        else if(type==="imposto"){event.loss=Math.max(1000,Math.round(gp.money*.1));gp.money-=event.loss;event.text=`Impostos! Você pagou ${fmt(event.loss)}.`;addLog(s,player.id,turn,"money",-event.loss,gp.position,`${player.name} pagou impostos ${fmt(event.loss)}.`);}
        else if(type==="familia"){if(gp.position===16&&!gp.spouse){gp.spouse=1;event.spouse=true;event.text="Casamento! Sua esposa entrou no carro (+$5.000 na riqueza final).";addLog(s,player.id,turn,"spouse",1,gp.position,`${player.name} casou!`);}else{gp.children_count++;gp.money-=5000;if(cn==="Chef")gp.money+=3000;event.child=true;event.loss=5000;event.text="Família cresceu! +1 filho (vale $10.000 na riqueza final). Custo $5.000.";addLog(s,player.id,turn,"child",1,gp.position,`${player.name} ganhou um filho!`);}}
        else if(type==="evento"||type==="sorte"){const eligible=cards.filter(c=>type==="sorte"?["sorte","positivo"].includes(c.kind):["positivo","negativo"].includes(c.kind));const card=eligible[randomInt(eligible.length)];let value=card.effect_money;if(value<0&&cn==="Medica")value=Math.round(value/2);if(value>0&&cn==="Fotografa")value+=1500;if(value>0&&type==="sorte"&&cn==="Desenvolvedor")value+=4000;gp.money+=value;event.card=card;event.value=value;event.gain=value>0?value:undefined;event.loss=value<0?-value:undefined;event.text=`${card.title} — ${card.description}`;addLog(s,player.id,turn,"event",value,gp.position,`${player.name}: ${card.title} (${fmt(value)}).`);}
        else if(type==="carreira"){const opts=[...careers].sort(()=>randomInt(2)-.5).slice(0,2);gp.pending_type="career";gp.pending_data={options:opts.map(c=>c.id)};event.need_choice=true;event.choice_kind="career";event.options=opts;event.text="Escolha sua carreira! Ela define seu salário.";}
        else if(type==="casa"){const houseId=size===60?(gp.position>=46?4:gp.position>=32?3:gp.position>=13?2:1):(gp.position>=28?4:gp.position>=19?3:gp.position>=13?2:1);const house=houses[houseId-1];gp.pending_type="house";gp.pending_data={house_id:houseId};event.need_choice=true;event.choice_kind="house";event.house=house;event.text=`Corretora: ${house.name} por ${fmt(house.price)}. Comprar?`;}
        else if(type==="escolha"){gp.pending_type=gp.position===10?"study":"invest";gp.pending_data={pos:gp.position};event.need_choice=true;event.choice_kind=gp.pending_type;event.text=gp.position===10?"Estudar (pague, ganhe +30% salário futuro) ou Trabalhar (receba agora)?":"Investimento ousado ou poupança segura?";}
        else if(type==="aposentadoria"){finishPlayer(s,gp);event.wealth=gp.final_wealth;event.text=`Aposentadoria! Riqueza final: ${fmt(gp.final_wealth)}.`;addLog(s,player.id,turn,"finish",gp.final_wealth,gp.position,`${player.name} chegou à aposentadoria com riqueza ${fmt(gp.final_wealth)}!`);}
        else event.text="Início da jornada. Boa sorte!";
        if(!event.need_choice){if(type==="aposentadoria"){if(s.game.players.every((x:Player)=>x.finished)){s.game.status="finished";s.room.status="finished";s.game.winner_player_id=[...s.game.players].sort((a:Player,b:Player)=>b.final_wealth-a.final_wealth)[0]?.player_id;s.room.finished_at=stamp();}else advanceLife(s);}else advanceLife(s);}
        await save(row,s);return json({ok:true,event,...gamePayload(s,player.id)});
      }
      if(action==="choice"){
        needTurn(s,player);if(!gp.pending_type)fail("Nenhuma escolha pendente.");const choice=String(input.choice??""),pending=gp.pending_type,data=gp.pending_data??{};let msg="";
        if(pending==="career"){const c=careers.find(x=>x.id===int(choice)&&data.options?.includes(x.id));if(!c)fail("Opção inválida.");gp.career_id=c.id;gp.salary=Math.round(c.salary*(gp.studied?1.3:1));gp.career_name=c.name;msg=`${player.name} virou ${c.name} (salário ${fmt(gp.salary)}).`;}
        else if(pending==="study"){if(choice==="study"){const cost=career(gp)?.name==="Professora"?7500:15000;gp.money-=cost;gp.studied=1;gp.salary=Math.round(gp.salary*1.3);msg=`${player.name} escolheu ESTUDAR (-${fmt(cost)}, +30% salário futuro).`;}else if(choice==="work"){gp.money+=10000;msg=`${player.name} escolheu TRABALHAR (+${fmt(10000)} agora).`;}else fail("Escolha inválida.");}
        else if(pending==="invest"){if(choice==="risk"){const win=randomInt(2)===1;let amount=win?10000:-10000;if(career(gp)?.name==="Empresaria"&&win)amount=15000;gp.money+=amount;msg=win?`${player.name} investiu e ganhou ${fmt(amount)}!`:`${player.name} perdeu ${fmt(-amount)} no investimento.`;}else if(choice==="safe"){gp.money+=3000;msg=`${player.name} poupou e recebeu ${fmt(3000)}.`;}else fail("Escolha inválida.");}
        else if(pending==="house"){const h=houses.find(x=>x.id===data.house_id);if(choice==="buy"){if(!h)fail("Casa inválida.");const price=Math.max(0,h.price-(career(gp)?.name==="Engenheira"?3000:0));if(gp.money<price)fail("Dinheiro insuficiente.");gp.money-=price;gp.house_id=h.id;gp.house_name=h.name;msg=`${player.name} comprou ${h.name}.`;}else if(choice==="skip")msg=`${player.name} decidiu não comprar uma casa.`;else fail("Escolha inválida.");}
        gp.pending_type=null;gp.pending_data=null;addLog(s,player.id,s.game.turn_index+1,"choice",0,gp.position,msg);advanceLife(s);await save(row,s);return json({ok:true,message:msg,...gamePayload(s,player.id)});
      }
      if(action==="car"){needTurn(s,player);if(gp.car_seats>=6)fail("Você já tem o carro de 6 lugares.");if(gp.money<25000)fail("Dinheiro insuficiente: o carro de 6 lugares custa $25.000.");gp.money-=25000;gp.car_seats=6;addLog(s,player.id,s.game.turn_index+1,"car",-25000,gp.position,`${player.name} comprou carro de 6 lugares.`);await save(row,s);return json({ok:true,...gamePayload(s,player.id)});}
    } else {
      if(action==="roll"){
        needTurn(s,player);if(s.game.pending_json?.type==="auction")fail("Aguarde o leilão terminar antes de rolar.",409);if(gp.bankrupt)fail("Você faliu.");if(gp.pending_type)fail("Resolva sua pendência antes.",409);const d1=1+randomInt(6),d2=1+randomInt(6),dice=d1+d2,old=gp.position,newPos=(old+dice)%32,passed=newPos<old;gp.last_dice=dice;gp.position=newPos;const event:any={dice:[d1,d2],need_choice:false,gain:undefined,loss:undefined,text:""};if(passed){gp.money+=2000;event.gain=2000;addLog(s,player.id,s.game.turn_index+1,"money",2000,newPos,`${player.name} passou pela Partida (+$2.000).`);}monoLand(s,player,gp,dice,event);if(!event.need_choice)monoAdvance(s);addLog(s,player.id,s.game.turn_index+1,"roll",dice,newPos,`${player.name} rolou ${d1}+${d2}=${dice}.`, { from: old, to: gp.position, dice: [d1,d2] });await save(row,s);return json({ok:true,event,...monoPayload(s,player.id)});
      }
      if(action==="buy"||action==="decline"){
        needTurn(s,player);if(gp.pending_type!=="buy")fail("Nada para comprar.",409);const tileNo=gp.pending_data?.tile,tile=monoTiles[tileNo],deed=s.game.deeds.find((d:Player)=>d.tile===tileNo);if(action==="buy"){if(!tile||!deed||deed.owner!=null)fail("Terreno indisponível.");if(gp.money<tile.price)fail("Dinheiro insuficiente.");gp.money-=tile.price;deed.owner=player.id;addLog(s,player.id,s.game.turn_index+1,"buy",-tile.price,tileNo,`${player.name} comprou ${tile.name} por ${fmt(tile.price)}.`);gp.pending_type=null;gp.pending_data=null;monoAdvance(s);await save(row,s);return json({ok:true,message:"Terreno comprado!",...monoPayload(s,player.id)});}
        gp.pending_type=null;gp.pending_data=null;const order=s.game.players.filter((p:Player)=>!p.bankrupt&&p.player_id!==player.id).map((p:Player)=>p.player_id);if(order.length){s.game.pending_json={type:"auction",tile:tileNo,order,idx:0,highest:0,by:null,bids:[]};addLog(s,player.id,s.game.turn_index+1,"system",0,tileNo,`${player.name} abriu um leilão por ${tile.name}.`);}else monoAdvance(s);await save(row,s);return json({ok:true,message:order.length?"Leilão aberto!":"Terreno recusado.",...monoPayload(s,player.id)});
      }
      if(action==="bid"){
        const a=s.game.pending_json;if(!a||a.type!=="auction")fail("Sem leilão ativo.",409);if(a.order[a.idx]!==player.id)fail("Aguarde sua vez de licitar.",403);const amount=Math.max(0,int(input.amount));if(amount>0&&amount<(a.highest||0)+100)fail(`Lance mínimo: ${fmt((a.highest||0)+100)}.`);if(amount>gp.money)fail("Sem saldo para esse lance.");if(amount){a.highest=amount;a.by=player.id;a.bids.push({pid:player.id,amt:amount});}a.idx++;let message="Lance registrado.";if(a.idx>=a.order.length){const winner=[...a.bids].sort((x:Player,y:Player)=>y.amt-x.amt).find((b:Player)=>{const w=s.game.players.find((p:Player)=>p.player_id===b.pid);return w&&!w.bankrupt&&w.money>=b.amt;});if(winner){const w=s.game.players.find((p:Player)=>p.player_id===winner.pid),d=s.game.deeds.find((x:Player)=>x.tile===a.tile);w.money-=winner.amt;d.owner=w.player_id;addLog(s,w.player_id,s.game.turn_index+1,"buy",-winner.amt,a.tile,`${w.name} arrematou ${monoTiles[a.tile].name} por ${fmt(winner.amt)}.`);message="Arrematado!";}s.game.pending_json=null;monoAdvance(s);}await save(row,s);return json({ok:true,message,...monoPayload(s,player.id)});
      }
      if(["build","sell","mortgage","unmortgage"].includes(action)){
        const tileNo=int(input.tile,-1),tile=monoTiles[tileNo],deed=s.game.deeds.find((d:Player)=>d.tile===tileNo);if(!tile||!deed||deed.owner!==player.id)fail("Terreno indisponível.");
        if(action==="build"){if(tile.kind!=="prop")fail("Só é possível construir em terrenos.");const group=s.game.deeds.filter((d:Player)=>d.info.color_group===tile.color_group);if(!group.every((d:Player)=>d.owner===player.id))fail("Compre todo o grupo antes de construir.");if(deed.houses>=5)fail("Esse terreno já tem hotel.");const nextLevel=deed.houses+1,min=Math.min(...group.map((d:Player)=>d.houses));if(nextLevel>min+1)fail("Construa por igual em todo o grupo.");const cost=tile.house_cost*(deed.houses>=4?2:1);if(gp.money<cost)fail("Dinheiro insuficiente.");gp.money-=cost;deed.houses++;addLog(s,player.id,s.game.turn_index+1,"build",-cost,tileNo,`${player.name} construiu em ${tile.name}.`);}
        if(action==="sell"){if(deed.houses<=0)fail("Nada para vender.");const group=s.game.deeds.filter((d:Player)=>d.info.color_group===tile.color_group);if(deed.houses<Math.max(...group.map((d:Player)=>d.houses)))fail("Venda primeiro dos terrenos mais altos do grupo.");const refund=deed.houses>=5?tile.house_cost:Math.floor(tile.house_cost/2);deed.houses--;gp.money+=refund;addLog(s,player.id,s.game.turn_index+1,"build",refund,tileNo,`${player.name} vendeu construção em ${tile.name}.`);}
        if(action==="mortgage"){if(deed.mortgaged||deed.houses>0)fail("Venda as construções antes de hipotecar.");deed.mortgaged=1;gp.money+=tile.mortgage;addLog(s,player.id,s.game.turn_index+1,"money",tile.mortgage,tileNo,`${player.name} hipotecou ${tile.name}.`);}
        if(action==="unmortgage"){if(!deed.mortgaged)fail("Esse terreno não está hipotecado.");const cost=Math.round(tile.mortgage*1.1);if(gp.money<cost)fail(`Faltam ${fmt(cost)} (+10% juros).`);gp.money-=cost;deed.mortgaged=0;addLog(s,player.id,s.game.turn_index+1,"money",-cost,tileNo,`${player.name} resgatou ${tile.name}.`);}
        await save(row,s);return json({ok:true,message:"Ação realizada.",...monoPayload(s,player.id)});
      }
      if(action==="jail_pay"){needTurn(s,player);if(!gp.in_jail)fail("Você não está preso.");if(gp.money<500)fail("Sem dinheiro para a fiança.");gp.money-=500;gp.in_jail=0;s.game.jackpot+=500;await save(row,s);return json({ok:true,message:"Livre! Agora role os dados.",...monoPayload(s,player.id)});}
      if(action==="jail_card"){needTurn(s,player);if(!gp.in_jail||gp.jail_free<=0)fail("Você não tem carta de saída livre.");gp.in_jail=0;gp.jail_free--;await save(row,s);return json({ok:true,message:"Livre! Agora role os dados.",...monoPayload(s,player.id)});}
      if(action==="bankrupt"){if(gp.money>=0)fail("Só pode falir devendo. Hipoteque ou negocie antes.",409);gp.bankrupt=1;gp.pending_type=null;s.game.deeds.filter((d:Player)=>d.owner===player.id).forEach((d:Player)=>{d.owner=null;d.houses=0;d.mortgaged=0;});if(s.game.current_player_id===player.id)monoAdvance(s);const alive=s.game.players.filter((p:Player)=>!p.bankrupt);if(alive.length<=1){s.game.status="finished";s.game.winner_player_id=alive[0]?.player_id??null;s.game.current_player_id=null;s.room.status="finished";s.room.current_turn_player_id=null;s.room.finished_at=stamp();}await save(row,s);return json({ok:true,message:"Falência declarada.",...monoPayload(s,player.id)});}
      if(action==="trade_offer"){
        const to=int(input.to),giveTiles=String(input.give_tiles??"").split(",").map(Number).filter(Number.isInteger),wantTiles=String(input.want_tiles??"").split(",").map(Number).filter(Number.isInteger),giveMoney=Math.max(0,int(input.give_money)),wantMoney=Math.max(0,int(input.want_money));if(!s.game.players.some((p:Player)=>p.player_id===to&&!p.bankrupt)||to===player.id)fail("Destinatário inválido.");if(!giveTiles.length&&!giveMoney||!wantTiles.length&&!wantMoney)fail("Ofereça e peça algo.");if(gp.money<giveMoney)fail("Sem saldo para ofertar.");for(const t of giveTiles){const d=s.game.deeds.find((x:Player)=>x.tile===t);if(!d||d.owner!==player.id||d.mortgaged||d.houses)fail("Um dos seus terrenos não está disponível para troca.");}const offer={id:Date.now(),game_id:s.game.id,from_player_id:player.id,to_player_id:to,give_tiles:giveTiles.join(","),give_money:giveMoney,want_tiles:wantTiles.join(","),want_money:wantMoney,status:"pending",expires_turn:s.game.turn_index+10};s.game.offers.push(offer);await save(row,s);return json({ok:true,message:"Proposta enviada!",...monoPayload(s,player.id)});
      }
      if(action==="trade_accept"||action==="trade_decline"){
        const offer=s.game.offers.find((o:Player)=>o.id===int(input.offer_id)&&o.status==="pending");if(!offer)fail("Proposta inválida.",404);if(offer.to_player_id!==player.id)fail("Só o destinatário decide.",403);if(action==="trade_decline"){offer.status="declined";await save(row,s);return json({ok:true,message:"Troca recusada.",...monoPayload(s,player.id)});}const from=s.game.players.find((p:Player)=>p.player_id===offer.from_player_id),to=s.game.players.find((p:Player)=>p.player_id===player.id);const gt=String(offer.give_tiles).split(",").filter(Boolean).map(Number),wt=String(offer.want_tiles).split(",").filter(Boolean).map(Number);if(from.money<offer.give_money||to.money<offer.want_money)fail("Saldo insuficiente. Proposta expirada.",409);for(const t of gt)if(s.game.deeds.find((d:Player)=>d.tile===t)?.owner!==from.player_id)fail("Terreno indisponível. Proposta expirada.",409);for(const t of wt)if(s.game.deeds.find((d:Player)=>d.tile===t)?.owner!==to.player_id)fail("Terreno indisponível. Proposta expirada.",409);from.money+=offer.want_money-offer.give_money;to.money+=offer.give_money-offer.want_money;gt.forEach((t:number)=>s.game.deeds.find((d:Player)=>d.tile===t).owner=to.player_id);wt.forEach((t:number)=>s.game.deeds.find((d:Player)=>d.tile===t).owner=from.player_id);offer.status="accepted";await save(row,s);return json({ok:true,message:"Troca feita!",...monoPayload(s,player.id)});
      }
    }
    fail("Ação desconhecida.",400);
  } catch (e) { const err=e instanceof ApiError?e:new ApiError("Erro temporário no servidor. Tente novamente.",500);return json({ok:false,error:err.message},err.status); }
}

type Context = { params: Promise<{ path: string[] }> };
async function handle(request:Request,context:Context) { const {path}=await context.params;return dispatch(request,path); }
export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
