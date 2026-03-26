'use client';

import React, { useState, useEffect } from 'react';
import { Users, Bus, Calendar, Clock, MapPin, CheckCircle, AlertCircle, Plus, Trash2, LogOut, ShieldAlert, Edit2, UserPlus, XCircle, Settings, RefreshCcw, CheckSquare, Square, PlayCircle, StopCircle, CalendarDays } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// 1. 수파베이스 DB 연결
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

type UserRole = 'user' | 'auth_user' | 'admin';
type User = { role: UserRole; name: string } | null;

const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/[^\d]/g, ''); 
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};

const formatUIDate = (isoString: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(null);
  const [view, setView] = useState<'home' | 'applyForm' | 'adminDashboard'>('home');
  const [schedule, setSchedule] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const { data: matchData } = await supabase.from('matches').select('*').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (matchData) {
        if (!matchData.bus_capacities) matchData.bus_capacities = {};
        setSchedule(matchData);
        const { data: resData } = await supabase.from('reservations').select('*').eq('match_id', matchData.id).order('bus_number', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
        if (resData) setApplications(resData);
      } else {
        setSchedule(null);
        setApplications([]);
      }
    } catch (error) { console.error('Data fetch error:', error); }
    finally { setDataLoading(false); }
  };

  useEffect(() => {
    const verifyTicket = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const ticket = urlParams.get('ticket');
      if (!ticket) return setAuthLoading(false); 

      if (ticket === 'test_admin') { setCurrentUser({ role: 'admin', name: '테스트관리자' }); setView('adminDashboard'); setAuthLoading(false); window.history.replaceState({}, document.title, window.location.pathname); return; }
      if (ticket === 'test_auth') { setCurrentUser({ role: 'auth_user', name: '테스트인증회원' }); setView('home'); setAuthLoading(false); window.history.replaceState({}, document.title, window.location.pathname); return; }
      if (ticket === 'test_user') { setCurrentUser({ role: 'user', name: '테스트일반회원' }); setView('home'); setAuthLoading(false); window.history.replaceState({}, document.title, window.location.pathname); return; }

      try {
        const response = await fetch('https://fcseoul12.com/api/sso/verify-ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, secret_key: 'FCSeoul_Bus_2026_Secret!' }) });
        const result = await response.json();
        if (result.status === 'success') {
          setCurrentUser({ name: result.data.nickname, role: result.data.role as UserRole });
          setView(result.data.role === 'admin' ? 'adminDashboard' : 'home');
          window.history.replaceState({}, document.title, window.location.pathname);
        } else { alert('로그인 정보가 만료되었습니다.'); }
      } catch (error) { console.error('API 대기중...'); } finally { setAuthLoading(false); }
    };
    fetchData().finally(() => verifyTicket());
  }, []);

  const activeApplications = applications.filter(app => app.status !== '취소요청' && app.status !== '환불완료');
  const cancelledApplications = applications.filter(app => app.status === '취소요청' || app.status === '환불완료');

  const activeSeats = activeApplications.reduce((total, app) => total + 1 + (app.companion_count || 0), 0);
  const cancelledSeats = cancelledApplications.reduce((total, app) => total + 1 + (app.companion_count || 0), 0);
  const grossSeats = activeSeats + cancelledSeats; 

  const generalSeats = activeApplications.filter(app => app.user_id !== '관리자수동추가').reduce((total, app) => total + 1 + (app.companion_count || 0), 0);
  const manualSeats = activeApplications.filter(app => app.user_id === '관리자수동추가').reduce((total, app) => total + 1 + (app.companion_count || 0), 0);

  const boardedSeats = activeApplications.reduce((total, app) => {
    let count = app.rep_boarded ? 1 : 0;
    if (app.companion_count > 0 && app.companions_info) count += app.companions_info.filter((c:any) => c.boarded).length;
    return total + count;
  }, 0);

  const handleLogout = () => { setCurrentUser(null); window.location.href = 'https://fcseoul12.com'; };

  const handleCreateMatch = async (newMatchData: any) => {
    await supabase.from('matches').update({ status: 'CLOSED' }).eq('status', 'OPEN');
    const { error } = await supabase.from('matches').insert([newMatchData]);
    if (error) {
      alert('일정 생성 중 오류가 발생했습니다: ' + error.message);
      return;
    }
    alert('새로운 원정 일정이 성공적으로 오픈되었습니다!');
    setShowCreateForm(false);
    fetchData(); 
  };

  const submitApplication = async (applicationData: any) => {
    const isWaiting = grossSeats >= schedule.max_seats; 
    let finalCompanions = applicationData.companions;
    let compCount = finalCompanions.length;
    
    if (applicationData.isAdminAdd && applicationData.totalHeadcount > 1) {
      compCount = applicationData.totalHeadcount - 1;
      finalCompanions = Array.from({ length: compCount }).map((_, i) => ({ name: `소모임 인원 ${i+1}`, phone: '', type: applicationData.representative.type, location: applicationData.representative.location, boarded: false }));
    } else {
      finalCompanions = finalCompanions.map((c:any) => ({...c, boarded: false}));
    }

    if (!applicationData.isAdminAdd && !isWaiting && grossSeats + 1 + compCount > schedule.max_seats) {
        alert(`잔여 좌석이 부족하여 신청 인원 전체가 대기자로 넘어갑니다.`);
    }

    const insertData = {
      match_id: schedule.id, user_id: applicationData.isAdminAdd ? '관리자수동추가' : currentUser?.name,
      rep_name: applicationData.representative.name, rep_phone: applicationData.representative.phone,
      boarding_type: applicationData.representative.type, boarding_location: applicationData.representative.location,
      companion_count: compCount, companions_info: finalCompanions,
      is_minor: applicationData.isMinor, guardian_phone: applicationData.guardianPhone,
      refund_account: applicationData.refundAccount || null,
      is_waiting: applicationData.isAdminAdd ? false : grossSeats >= schedule.max_seats,
      status: applicationData.isAdminAdd ? '입금완료' : '입금대기',
      bus_number: applicationData.busNumber || null, rep_boarded: false
    };

    const { error } = await supabase.from('reservations').insert([insertData]);
    if (error) alert('오류: ' + error.message);
    else {
      if(!applicationData.isAdminAdd) alert(insertData.is_waiting ? '[대기자]로 신청되었습니다.' : '신청이 완료되었습니다!');
      fetchData();
      if(!applicationData.isAdminAdd) setView('home');
    }
  };

  const handlePartialCancel = async (app: any, targetIdx: number) => {
    if (!window.confirm('선택한 인원의 예매를 취소하시겠습니까?\n(취소된 인원은 환불 대기 명단으로 이동됩니다.)')) return;

    if (targetIdx === -1 && app.companion_count === 0) {
      await supabase.from('reservations').update({ status: '취소요청', bus_number: null, rep_boarded: false }).eq('id', app.id);
      fetchData();
      return;
    }

    let cancelledPerson = null;

    if (targetIdx === -1) {
      cancelledPerson = { name: app.rep_name, phone: app.rep_phone, type: app.boarding_type, location: app.boarding_location };
      const newRep = app.companions_info[0];
      const newCompanions = app.companions_info.slice(1);
      await supabase.from('reservations').update({ 
        rep_name: newRep.name || '이름없음', rep_phone: newRep.phone || app.rep_phone, 
        boarding_type: newRep.type || app.boarding_type, boarding_location: newRep.location || app.boarding_location, 
        companion_count: app.companion_count - 1, companions_info: newCompanions, rep_boarded: newRep.boarded || false 
      }).eq('id', app.id);
    } else {
      cancelledPerson = app.companions_info[targetIdx];
      const newCompanions = [...app.companions_info];
      newCompanions.splice(targetIdx, 1);
      await supabase.from('reservations').update({ companion_count: app.companion_count - 1, companions_info: newCompanions }).eq('id', app.id);
    }

    await supabase.from('reservations').insert([{
      match_id: app.match_id, user_id: app.user_id, rep_name: cancelledPerson.name, rep_phone: cancelledPerson.phone,
      boarding_type: cancelledPerson.type || app.boarding_type, boarding_location: cancelledPerson.location || app.boarding_location,
      companion_count: 0, companions_info: [], refund_account: app.refund_account, bus_number: null, status: '취소요청', is_waiting: false, rep_boarded: false
    }]);

    fetchData();
  };

  const toggleBoarding = async (app: any, targetIdx: number) => {
    if (!schedule.is_boarding_started && currentUser?.role !== 'admin') { alert('아직 탑승이 시작되지 않았습니다!'); return; }
    if (currentUser?.role !== 'admin') {
       const isCurrentlyBoarded = targetIdx === -1 ? app.rep_boarded : app.companions_info[targetIdx].boarded;
       const msg = isCurrentlyBoarded ? '탑승 체크를 해제하시겠습니까?' : '버스에 탑승하셨습니까?\n(확인을 누르면 탑승 완료 처리됩니다)';
       if (!window.confirm(msg)) return;
    }
    if (targetIdx === -1) {
      await supabase.from('reservations').update({ rep_boarded: !app.rep_boarded }).eq('id', app.id);
    } else {
      const newCompanions = [...app.companions_info];
      newCompanions[targetIdx] = { ...newCompanions[targetIdx], boarded: !newCompanions[targetIdx].boarded };
      await supabase.from('reservations').update({ companions_info: newCompanions }).eq('id', app.id);
    }
    fetchData();
  };

  const toggleBoardingStatusMaster = async () => {
    const nextStatus = !schedule.is_boarding_started;
    const msg = nextStatus ? '🚀 현장 탑승을 시작하시겠습니까?\n(사용자들이 탑승 체크를 할 수 있게 됩니다.)' : '🛑 현장 탑승을 마감하시겠습니까?';
    if(window.confirm(msg)) { await supabase.from('matches').update({ is_boarding_started: nextStatus }).eq('id', schedule.id); fetchData(); }
  };

  const updateMatchInfo = async (updateData: any) => {
    await supabase.from('matches').update(updateData).eq('id', schedule.id);
    alert('경기 일정이 성공적으로 업데이트되었습니다!');
    fetchData();
  };

  const updateApplicationStatus = async (id: string, newStatus: string) => { await supabase.from('reservations').update({ status: newStatus }).eq('id', id); fetchData(); };
  const updateBusNumber = async (id: string, busNum: string) => { const val = busNum === '' ? null : parseInt(busNum, 10); await supabase.from('reservations').update({ bus_number: val }).eq('id', id); fetchData(); };
  const updateBusSettings = async (newSeats: number, newBuses: number, capacities: Record<string, number>) => {
    if (!isNaN(newSeats) && !isNaN(newBuses)) { await supabase.from('matches').update({ max_seats: newSeats, bus_count: newBuses, bus_capacities: capacities }).eq('id', schedule?.id); fetchData(); }
  };
  const hardDeleteApplication = async (id: string) => { if(window.confirm('경고: 환불 명단에서도 삭제되어 누적 카운트가 줄어듭니다. 영구 삭제하시겠습니까?')) { await supabase.from('reservations').delete().eq('id', id); fetchData(); } };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
         <div className="relative mb-6"><Bus size={64} className="text-red-600 animate-bounce relative z-10" /><div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-10 h-2 bg-red-900 rounded-full blur-sm animate-pulse"></div></div>
         <h1 className="text-2xl font-black text-white mb-2 animate-pulse">수호신 인증 확인 중...</h1>
      </div>
    );
  }

  if (!currentUser) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="bg-white p-8 rounded text-center"><h1 className="text-xl font-bold">권한 없음</h1><p className="mt-2 text-sm">홈페이지를 통해 로그인해주세요.</p></div></div>;

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800 relative">
      {dataLoading && !authLoading && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-20 z-50 flex flex-col items-center justify-center backdrop-blur-sm transition-all duration-300">
           <Bus size={48} className="text-red-600 animate-bounce mb-3 drop-shadow-md" />
        </div>
      )}
      <nav className="bg-black text-white shadow-md border-b-4 border-red-600">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3 font-black text-xl cursor-pointer" onClick={() => setView(currentUser.role === 'admin' ? 'adminDashboard' : 'home')}><img src="/logo.png" alt="Logo" className="w-8 h-8" onError={(e)=>e.currentTarget.style.display='none'}/> <span className="text-red-600">수호신 <span className="text-white">원정버스</span></span></div>
          <div className="flex items-center space-x-4">
            <span className="text-sm bg-gray-800 border border-gray-700 px-3 py-1 rounded-full text-red-400 font-bold hidden sm:inline-block">
              {currentUser.name} ({currentUser.role === 'admin' ? '관리자' : currentUser.role === 'auth_user' ? '인증회원' : '일반회원'})
            </span>
            <button onClick={handleLogout} className="text-sm hover:text-red-500"><LogOut size={16} className="inline"/> 돌아가기</button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {showCreateForm ? (
          <CreateMatchForm onSave={handleCreateMatch} onCancel={() => setShowCreateForm(false)} />
        ) : !schedule ? (
          <div className="text-center py-20 bg-white rounded-xl shadow-md border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-600 mb-6">현재 진행 중인 예매 일정이 없습니다.</h2>
            {currentUser.role === 'admin' ? (
              <button onClick={() => setShowCreateForm(true)} className="bg-red-600 text-white font-bold px-8 py-4 rounded-lg hover:bg-red-700 shadow-md animate-pulse text-lg">
                <Plus size={24} className="inline mr-2"/> 새로운 원정 일정 시작하기
              </button>
            ) : (
              <p className="text-gray-500">다음 원정버스가 오픈될 때까지 기다려주세요.</p>
            )}
          </div>
        ) : (
          <>
            {view === 'home' && <UserHome key={`home-${schedule.id}`} schedule={schedule} totalSeats={grossSeats} onApplyClick={() => setView('applyForm')} currentUser={currentUser} activeApps={activeApplications} onPartialCancel={handlePartialCancel} onToggleBoarding={toggleBoarding} />}
            {view === 'applyForm' && <ApplicationForm key={`apply-${schedule.id}`} schedule={schedule} reservedSeats={grossSeats} onCancel={() => setView('home')} onSubmit={submitApplication} />}
            {view === 'adminDashboard' && <AdminDashboard key={`admin-${schedule.id}`} schedule={schedule} activeApps={activeApplications} cancelledApps={cancelledApplications} stats={{ activeSeats, cancelledSeats, grossSeats, boardedSeats, generalSeats, manualSeats }} onUpdateStatus={updateApplicationStatus} onUpdateBusNumber={updateBusNumber} onHardDelete={hardDeleteApplication} onUpdateSettings={updateBusSettings} onManualAdd={submitApplication} onPartialCancel={handlePartialCancel} onToggleBoarding={toggleBoarding} onToggleBoardingStatusMaster={toggleBoardingStatusMaster} onUpdateMatchInfo={updateMatchInfo} onCreateNewMatch={() => setShowCreateForm(true)} />}
          </>
        )}
      </main>
    </div>
  );
}

// ================= 🔥 원정 생성 폼 (자유 줄글 텍스트에어리어 적용) =================
function CreateMatchForm({ onSave, onCancel }: any) {
  const [formData, setFormData] = useState({
    title: '', match_date: '', departure_time: '', price: '', account_info: '',
    auth_open_time: '', user_open_time: '', close_time: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!formData.match_date) return alert('경기 일자를 선택해주세요.');
    if(!formData.auth_open_time || !formData.user_open_time || !formData.close_time) {
      return alert('예매 시간 3가지를 모두 설정해주세요.');
    }
    onSave({
      title: formData.title,
      match_date: new Date(formData.match_date).toISOString(),
      departure_time: formData.departure_time,
      price: Number(formData.price),
      account_info: formData.account_info,
      auth_open_time: new Date(formData.auth_open_time).toISOString(),
      user_open_time: new Date(formData.user_open_time).toISOString(),
      close_time: new Date(formData.close_time).toISOString(),
      max_seats: 44, 
      bus_count: 1, 
      bus_capacities: { "1": 44 },
      status: 'OPEN',
      is_boarding_started: false
    });
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-lg max-w-2xl mx-auto border-t-8 border-red-600 animate-fade-in">
      <h2 className="text-2xl font-black mb-6 flex items-center text-gray-800"><CalendarDays className="mr-2 text-red-600" size={28}/> 새로운 원정 일정 만들기</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-bold text-gray-700 mb-1">원정 경기명 (제목)</label><input type="text" value={formData.title} onChange={e=>setFormData({...formData, title:e.target.value})} className="w-full border p-3 rounded bg-gray-50 focus:ring-red-600 focus:bg-white" placeholder="예: FC안양 원정버스" required /></div>
          <div><label className="block text-sm font-bold text-red-600 mb-1">경기 일자 (필수)</label><input type="date" value={formData.match_date} onChange={e=>setFormData({...formData, match_date:e.target.value})} className="w-full border p-3 rounded bg-gray-50 focus:bg-white" required /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-bold text-gray-700 mb-1">입금 계좌번호</label><input type="text" value={formData.account_info} onChange={e=>setFormData({...formData, account_info:e.target.value})} className="w-full border p-3 rounded bg-gray-50 focus:bg-white" placeholder="예: 신한은행 110-123-456 수호신" required /></div>
          <div><label className="block text-sm font-bold text-gray-700 mb-1">탑승 가격 (숫자만)</label><input type="number" value={formData.price} onChange={e=>setFormData({...formData, price:e.target.value})} className="w-full border p-3 rounded bg-gray-50 focus:bg-white" placeholder="예: 25000" required /></div>
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">타임테이블 (자유롭게 줄글 작성)</label>
          <textarea value={formData.departure_time} onChange={e=>setFormData({...formData, departure_time:e.target.value})} className="w-full border p-3 rounded bg-gray-50 focus:bg-white" placeholder="예: 오전 10시 30분 서울 출발&#13;&#10;오전 11시 30분 안양 도착&#13;&#10;ㅡ 경기 종료 후 즉시 귀가 ㅡ" rows={4} required />
        </div>
        <div className="bg-red-50 p-4 rounded-lg border border-red-100 mt-6">
          <h4 className="font-bold text-red-700 mb-3">예매 오픈/마감 시간 설정</h4>
          <div className="space-y-3">
            <div><label className="block text-xs font-bold text-gray-700 mb-1">인증회원 오픈 시간</label><input type="datetime-local" value={formData.auth_open_time} onChange={e=>setFormData({...formData, auth_open_time:e.target.value})} className="w-full border p-2 rounded text-sm bg-white" required /></div>
            <div><label className="block text-xs font-bold text-gray-700 mb-1">일반회원 오픈 시간</label><input type="datetime-local" value={formData.user_open_time} onChange={e=>setFormData({...formData, user_open_time:e.target.value})} className="w-full border p-2 rounded text-sm bg-white" required /></div>
            <div><label className="block text-xs font-bold text-gray-700 mb-1">예매 최종 마감 시간</label><input type="datetime-local" value={formData.close_time} onChange={e=>setFormData({...formData, close_time:e.target.value})} className="w-full border p-2 rounded text-sm bg-white" required /></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button type="button" onClick={onCancel} className="px-6 py-3 border border-gray-300 rounded font-bold text-gray-600 hover:bg-gray-50 transition-colors">취소</button>
          <button type="submit" className="px-6 py-3 bg-red-600 text-white font-bold rounded hover:bg-red-700 transition-colors shadow-md">새 일정 오픈하기</button>
        </div>
      </form>
    </div>
  );
}


// ================= 일반 사용자 홈 =================
function UserHome({ schedule, totalSeats, onApplyClick, currentUser, activeApps, onPartialCancel, onToggleBoarding }: any) {
  const isSoldOut = totalSeats >= schedule.max_seats; 
  const myApplications = activeApps.filter((app: any) => app.user_id === currentUser.name);

  const [now, setNow] = useState(new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);

  const authOpenTime = schedule.auth_open_time ? new Date(schedule.auth_open_time) : new Date('2026-03-28T15:00:00+09:00');
  const userOpenTime = schedule.user_open_time ? new Date(schedule.user_open_time) : new Date('2026-03-28T17:00:00+09:00');
  const closeTime = schedule.close_time ? new Date(schedule.close_time) : new Date('2026-04-03T23:59:59+09:00');

  let canApply = true;
  let btnText = isSoldOut ? '대기자로 신청하기' : '원정버스 신청하기';
  let btnClass = "w-full py-4 rounded-lg font-black text-white text-lg transition-colors shadow-md " + (isSoldOut ? "bg-red-700 hover:bg-red-800" : "bg-red-600 hover:bg-red-700");

  if (now > closeTime) { canApply = false; btnText = `신청 마감 (${formatUIDate(schedule.close_time)} 종료됨)`; btnClass = "w-full py-4 rounded-lg font-black text-white text-lg bg-gray-500 cursor-not-allowed"; }
  else if (currentUser.role === 'user' && now < userOpenTime) { canApply = false; btnText = `일반회원 오픈: ${formatUIDate(schedule.user_open_time)}`; btnClass = "w-full py-4 rounded-lg font-black text-gray-500 text-lg bg-gray-200 cursor-not-allowed"; }
  else if (currentUser.role === 'auth_user' && now < authOpenTime) { canApply = false; btnText = `인증회원 오픈: ${formatUIDate(schedule.auth_open_time)}`; btnClass = "w-full py-4 rounded-lg font-black text-gray-500 text-lg bg-gray-200 cursor-not-allowed"; }
  if (currentUser.role === 'admin') { canApply = false; btnText = '관리자는 패널에서 직접 추가하세요'; btnClass = "w-full py-4 rounded-lg font-black text-white text-lg bg-gray-800 cursor-not-allowed"; }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-600">
        <h2 className="text-lg font-bold mb-2 flex items-center text-black"><AlertCircle size={20} className="mr-2 text-red-600" /> 예매 및 환불 규정</h2>
        <ul className="list-disc pl-5 text-gray-600 space-y-2 text-sm">
          <li><strong>신청 마감:</strong> {formatUIDate(schedule.close_time)} 마감 <span className="text-red-500 font-bold">(조기 마감될 수 있습니다)</span></li>
          <li><strong>환불 규정:</strong> 24시간 이내 100% / 탑승문자 발송 전 50% / 출발 3일 전 환불불가</li>
          <li>탑승자 식별을 위해 개인 양도는 불가하며, <strong>동반자 개별 취소는 가능합니다.</strong></li>
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
        <div className="bg-black text-white px-6 py-4 flex justify-between items-center border-b-2 border-red-600">
          <h2 className="text-xl font-black tracking-tight">{schedule.title}</h2>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${isSoldOut ? 'bg-red-600 text-white' : 'bg-white text-red-600'}`}>{now > closeTime ? '예매 마감' : isSoldOut ? '마감 / 대기자 접수중' : '신청가능'}</span>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-black text-gray-800 mb-3 flex items-center"><Clock size={18} className="mr-2 text-red-600"/> &lt;TIME TABLE&gt;</h3>
              {/* 🔥 줄글이 그대로 반영되도록 수정 */}
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {schedule.departure_time}
              </div>
            </div>
            <div className="flex items-start space-x-3 p-2"><MapPin className="text-red-600 mt-1" size={20} /><div><p className="font-bold text-gray-800">계좌 안내</p><p className="text-sm text-gray-600">가격: {schedule.price.toLocaleString()}원</p><p className="text-sm font-bold text-red-600 mt-1">{schedule.account_info}</p></div></div>
          </div>
          <div className="flex flex-col justify-center items-center bg-white rounded-lg p-6 border-2 border-dashed border-gray-200">
            <div className="text-center mb-6">
              <p className="text-gray-500 text-sm font-bold mb-1">현재 예매 현황 (최대 {schedule.max_seats}석)</p>
              <p className="text-5xl font-black text-black"><span className={isSoldOut ? 'text-red-600' : 'text-black'}>{totalSeats}</span> <span className="text-2xl text-gray-400">/ {schedule.max_seats}</span></p>
            </div>
            <button onClick={onApplyClick} disabled={!canApply} className={btnClass}>{btnText}</button>
          </div>
        </div>
      </div>

      {myApplications.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-md">
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h2 className="text-lg font-black">나의 탑승권 및 신청 내역</h2>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${schedule.is_boarding_started ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-gray-100 text-gray-500'}`}>
              {schedule.is_boarding_started ? '🚀 현장 탑승 진행중' : '탑승 대기중'}
            </span>
          </div>
          <div className="space-y-4">
            {myApplications.map((app: any) => (
              <div key={app.id} className={`border p-4 rounded-lg transition-colors ${app.rep_boarded ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-3">
                  <span className="font-black text-lg text-blue-700">{app.bus_number ? `🚌 ${app.bus_number}호차 배정됨` : '호차 배정 대기중'}</span>
                  <span className="font-bold bg-gray-800 text-white px-3 py-1 rounded-full text-sm">{app.status}</span>
                </div>
                <div className="flex justify-between items-center py-3 bg-white px-4 rounded shadow-sm mb-2 border border-gray-100">
                  <div><p className="font-bold text-gray-800 text-lg"><span className="text-red-600 mr-1 text-sm">[대표]</span> {app.rep_name} <span className="text-sm text-gray-500 font-normal">({app.boarding_type})</span></p></div>
                  <div className="flex gap-2 items-center">
                    {app.status === '입금완료' && (
                      <button onClick={() => onToggleBoarding(app, -1)} disabled={!schedule.is_boarding_started && !app.rep_boarded} className={`flex items-center px-4 py-2 rounded-full font-bold text-sm transition-colors shadow-sm ${app.rep_boarded ? 'bg-green-500 text-white hover:bg-green-600' : schedule.is_boarding_started ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                        {app.rep_boarded ? <><CheckCircle size={16} className="mr-1"/> 탑승완료</> : schedule.is_boarding_started ? '현장 탑승체크' : '탑승 대기중'}
                      </button>
                    )}
                    {!app.rep_boarded && <button onClick={() => onPartialCancel(app, -1)} className="text-sm text-red-500 hover:text-red-700 px-2 py-1 font-bold">취소</button>}
                  </div>
                </div>
                {app.companions_info?.map((comp: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-2 mt-2 bg-white px-4 rounded border border-gray-100">
                    <p className={`font-medium ${comp.boarded ? 'text-green-700' : 'text-gray-700'}`}>동반자: {comp.name} <span className="text-xs text-gray-500">({comp.type})</span></p>
                    <div className="flex gap-2 items-center">
                      {app.status === '입금완료' && (
                        <button onClick={() => onToggleBoarding(app, idx)} disabled={!schedule.is_boarding_started && !comp.boarded} className={`flex items-center px-3 py-1.5 rounded-full font-bold text-xs transition-colors ${comp.boarded ? 'bg-green-100 text-green-700' : schedule.is_boarding_started ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                          {comp.boarded ? <><CheckCircle size={14} className="mr-1"/> 확인됨</> : schedule.is_boarding_started ? '체크하기' : '대기중'}
                        </button>
                      )}
                      {!comp.boarded && <button onClick={() => onPartialCancel(app, idx)} className="text-sm text-red-400 hover:text-red-600 px-2 font-bold">취소</button>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ================= 🔥 일반 신청 폼 (예시, 개인정보 텍스트 복구) =================
function ApplicationForm({ schedule, reservedSeats, onCancel, onSubmit }: any) {
  const isSoldOut = reservedSeats >= schedule.max_seats; 
  const [rep, setRep] = useState({ name: '', phone: '', type: '왕복', location: '서울월드컵경기장' });
  const [companions, setCompanions] = useState<any[]>([]);
  const [isMinor, setIsMinor] = useState(false);
  const [guardianPhone, setGuardianPhone] = useState('');
  const [refundAccount, setRefundAccount] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!rep.name || !rep.phone) return alert('대표자 정보를 입력해주세요.');
    if(rep.phone.length < 12) return alert('올바른 연락처를 입력해주세요.'); 
    if(!privacyAgreed) return alert('동의가 필요합니다.');
    onSubmit({ representative: rep, companions, isMinor, guardianPhone, refundAccount, isAdminAdd: false });
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
      <div className="bg-black border-b-4 border-red-600 p-4 text-white flex justify-between items-center"><div><h2 className="text-xl font-black">버스 탑승 신청</h2></div></div>
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 🔥 폼 입력칸 예시(placeholder) 부활 */}
          <div><label className="block text-xs font-bold text-gray-500 mb-1">성함</label><input type="text" value={rep.name} onChange={e => setRep({...rep, name: e.target.value})} className="w-full border p-2 rounded focus:ring-red-600" placeholder="예: 홍길동" required /></div>
          <div><label className="block text-xs font-bold text-gray-500 mb-1">연락처</label><input type="text" value={rep.phone} onChange={e => setRep({...rep, phone: formatPhoneNumber(e.target.value)})} maxLength={13} className="w-full border p-2 rounded focus:ring-red-600" required placeholder="010-0000-0000" /></div>
          <div><label className="block text-xs font-bold text-gray-500 mb-1">탑승 유형</label><select value={rep.type} onChange={e => setRep({...rep, type: e.target.value})} className="w-full border p-2 rounded"><option value="왕복">왕복</option><option value="상행">상행</option><option value="하행">하행</option></select></div>
          <div><label className="block text-xs font-bold text-gray-500 mb-1">탑승지</label><select value={rep.location} onChange={e => setRep({...rep, location: e.target.value})} className="w-full border p-2 rounded"><option value="서울월드컵경기장">서울월드컵경기장</option><option value="서초">서초</option></select></div>
        </div>
        <section className="bg-gray-50 p-4 rounded-lg">
          <label className="flex items-center space-x-2 text-sm font-bold"><input type="checkbox" checked={isMinor} onChange={e => setIsMinor(e.target.checked)} className="rounded" /><span>미성년자 (보호자 연락처 필요)</span></label>
          {isMinor && <input type="text" value={guardianPhone} onChange={e => setGuardianPhone(formatPhoneNumber(e.target.value))} className="mt-2 w-full border p-2 rounded text-sm focus:ring-red-600" placeholder="보호자 연락처 (010-0000-0000)" required />}
          {isSoldOut && <div className="mt-3"><label className="block text-sm font-bold text-red-700 mb-1">환불 계좌 (대기자 필수)</label><input type="text" value={refundAccount} onChange={e => setRefundAccount(e.target.value)} className="w-full border p-2 rounded focus:ring-red-600" placeholder="예: 신한은행 110-123-456 홍길동" required /></div>}
        </section>
        <section>
          <div className="flex justify-between items-center border-b pb-2 mb-2"><h3 className="font-bold">동반 탑승자 ({companions.length}명)</h3><button type="button" onClick={() => setCompanions([...companions, { id: Date.now(), name: '', phone: '', type: '왕복', location: '서울월드컵경기장' }])} className="text-sm bg-black text-white px-2 py-1 rounded hover:bg-gray-800">추가</button></div>
          {companions.map((comp, idx) => (
             <div key={comp.id} className="relative border p-3 rounded mb-2">
               <button type="button" onClick={() => setCompanions(companions.filter(c => c.id !== comp.id))} className="absolute top-2 right-2 text-red-500"><Trash2 size={16}/></button>
               <div className="grid grid-cols-2 gap-2 mt-2">
                 <input type="text" value={comp.name} onChange={e => setCompanions(companions.map(c => c.id === comp.id ? {...c, name: e.target.value} : c))} className="border p-2 text-sm rounded focus:ring-red-600" placeholder="동반자 성함" required />
                 <input type="text" value={comp.phone} onChange={e => setCompanions(companions.map(c => c.id === comp.id ? {...c, phone: formatPhoneNumber(e.target.value)} : c))} maxLength={13} className="border p-2 text-sm rounded focus:ring-red-600" placeholder="010-0000-0000" required />
                 <select value={comp.type} onChange={e => setCompanions(companions.map(c => c.id === comp.id ? {...c, type: e.target.value} : c))} className="border p-2 text-sm rounded"><option value="왕복">왕복</option><option value="상행">상행</option><option value="하행">하행</option></select>
                 <select value={comp.location} onChange={e => setCompanions(companions.map(c => c.id === comp.id ? {...c, location: e.target.value} : c))} className="border p-2 text-sm rounded"><option value="서울월드컵경기장">서울월드컵경기장</option><option value="서초">서초</option></select>
               </div>
             </div>
          ))}
        </section>
        
        {/* 🔥 개인정보 수집 동의 세부사항 복구 */}
        <section className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
          <label className="flex items-start space-x-2 cursor-pointer">
            <input type="checkbox" checked={privacyAgreed} onChange={e => setPrivacyAgreed(e.target.checked)} required className="mt-1 rounded text-red-600 focus:ring-red-600 w-4 h-4" />
            <span className="text-gray-700">
              <strong>[필수] 개인정보 수집 및 이용 동의</strong><br/>
              <span className="text-xs text-gray-500 mt-1 block leading-relaxed">
                1. 수집목적: 수호신 원정버스 탑승자 식별, 비상연락 및 환불 처리<br/>
                2. 수집항목: 성명, 연락처, 환불계좌 (필요 시 보호자 연락처)<br/>
                3. 보유기간: <strong>해당 원정 경기 종료 및 정산 완료 후 즉시 파기</strong>
              </span>
            </span>
          </label>
        </section>

        <div className="bg-black p-4 rounded-lg flex justify-between items-center text-white">
          <div><p className="text-sm text-gray-400">총 결제 금액</p><p className="text-2xl font-black text-red-500">{((1 + companions.length) * schedule.price).toLocaleString()}원</p></div>
          <div className="space-x-2 flex"><button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-700 rounded text-gray-300">취소</button><button type="submit" className="px-6 py-2 bg-red-600 font-bold rounded">신청 완료</button></div>
        </div>
      </form>
    </div>
  );
}

// ================= 👑 관리자 대시보드 =================
function AdminDashboard({ schedule, activeApps, cancelledApps, stats, onUpdateStatus, onUpdateBusNumber, onHardDelete, onUpdateSettings, onManualAdd, onPartialCancel, onToggleBoarding, onToggleBoardingStatusMaster, onUpdateMatchInfo, onCreateNewMatch }: any) {
  if (!schedule) return null;

  const [showManualAdd, setShowManualAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMatchInfo, setShowMatchInfo] = useState(false);
  
  const toLocalISOString = (isoString: string) => isoString ? new Date(new Date(isoString).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  
  const [matchData, setMatchData] = useState({
    title: schedule.title || '', 
    match_date: schedule.match_date ? schedule.match_date.slice(0, 10) : '', 
    departure_time: schedule.departure_time || '', 
    price: schedule.price || 0, 
    account_info: schedule.account_info || '',
    auth_open_time: toLocalISOString(schedule.auth_open_time), 
    user_open_time: toLocalISOString(schedule.user_open_time), 
    close_time: toLocalISOString(schedule.close_time)
  });

  const handleMatchInfoSave = () => {
    if(!matchData.match_date) return alert('경기 일자를 선택해주세요.');
    const parsedData = { ...matchData, 
      match_date: new Date(matchData.match_date).toISOString(),
      auth_open_time: matchData.auth_open_time ? new Date(matchData.auth_open_time).toISOString() : null, 
      user_open_time: matchData.user_open_time ? new Date(matchData.user_open_time).toISOString() : null, 
      close_time: matchData.close_time ? new Date(matchData.close_time).toISOString() : null
    };
    onUpdateMatchInfo(parsedData);
    setShowMatchInfo(false);
  };

  const currentCapacities = schedule.bus_capacities || {};
  const [settingsData, setSettingsData] = useState({ maxSeats: schedule.max_seats, busCount: schedule.bus_count || 1, capacities: currentCapacities });
  const [manualData, setManualData] = useState({ name: '', phone: '', type: '왕복', location: '서울월드컵경기장', busNumber: '', totalHeadcount: 1 });
  const [filterBus, setFilterBus] = useState<string | number>('ALL');
  const busOptions = Array.from({ length: schedule.bus_count || 1 }, (_, i) => i + 1);

  const getBusCurrentHeadcount = (busNum: number) => activeApps.filter((a:any) => a.bus_number === busNum).reduce((total:number, app:any) => total + 1 + (app.companion_count || 0), 0);
  const getBusBoardedHeadcount = (busNum: number) => activeApps.filter((a:any) => a.bus_number === busNum).reduce((total:number, app:any) => total + (app.rep_boarded ? 1 : 0) + (app.companions_info ? app.companions_info.filter((c:any) => c.boarded).length : 0), 0);

  const handleSettingsSave = () => {
    const totalCap = Object.values(settingsData.capacities).reduce((a: any, v: any) => a + Number(v), 0) as number;
    onUpdateSettings(totalCap > 0 ? totalCap : settingsData.maxSeats, settingsData.busCount, settingsData.capacities);
    setShowSettings(false);
  };

  const handleManualAddSubmit = () => {
    if(!manualData.name) return alert('이름을 입력해주세요.');
    onManualAdd({ representative: manualData, companions: [], isMinor: false, isAdminAdd: true, busNumber: manualData.busNumber, totalHeadcount: manualData.totalHeadcount });
    setShowManualAdd(false);
  };

  let filteredApplications = activeApps;
  if (filterBus === 'CANCELLED') filteredApplications = cancelledApps;
  else filteredApplications = activeApps.filter((app:any) => filterBus === 'ALL' ? true : filterBus === 'UNASSIGNED' ? !app.bus_number : app.bus_number === filterBus);

  return (
    <div className="space-y-6">
      <div className="bg-black text-white p-4 rounded-xl border-l-4 border-red-600 flex justify-between items-center flex-wrap gap-4 shadow-lg">
        <div>
          <h2 className="text-xl font-black"><ShieldAlert className="inline mr-2 text-red-600" size={24} /> {schedule.title} 관리 패널</h2>
          <p className="text-base text-gray-300 mt-2">누적예매: <span className="text-red-400 font-bold">{stats.grossSeats}명</span> / 최대 {schedule.max_seats}석 (실탑승 {stats.activeSeats} | 취소 {stats.cancelledSeats})</p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <button onClick={onToggleBoardingStatusMaster} className={`px-5 py-3 rounded-lg font-black text-base shadow-md transition-all flex items-center ${schedule.is_boarding_started ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-green-600 hover:bg-green-700'}`}>
            {schedule.is_boarding_started ? <><StopCircle size={20} className="mr-2"/> 탑승 마감하기 (OFF)</> : <><PlayCircle size={20} className="mr-2"/> 탑승 시작! (ON)</>}
          </button>
          <div className="flex gap-2 mt-1 flex-wrap">
            <button onClick={() => {setShowMatchInfo(!showMatchInfo); setShowSettings(false); setShowManualAdd(false);}} className={`px-3 py-1.5 rounded text-xs font-bold ${showMatchInfo ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300'}`}><CalendarDays size={12} className="inline mr-1"/> 일정수정</button>
            <button onClick={() => {setShowSettings(!showSettings); setShowMatchInfo(false); setShowManualAdd(false);}} className={`px-3 py-1.5 rounded text-xs font-bold ${showSettings ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}><Settings size={12} className="inline mr-1"/> 배차설정</button>
            <button onClick={() => {setShowManualAdd(!showManualAdd); setShowSettings(false); setShowMatchInfo(false);}} className={`px-3 py-1.5 rounded text-xs font-bold ${showManualAdd ? 'bg-red-800 text-white' : 'bg-gray-800 text-gray-300'}`}><UserPlus size={12} className="inline mr-1"/> 수동추가</button>
          </div>
        </div>
      </div>

      {showMatchInfo && (
        <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-5 shadow-inner animate-fade-in relative">
          <button onClick={onCreateNewMatch} className="absolute top-4 right-4 bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-red-700 shadow flex items-center"><AlertCircle size={14} className="mr-1"/> 새로운 원정 시작</button>
          <h3 className="font-bold text-purple-800 mb-4 flex items-center"><CalendarDays size={18} className="mr-2"/> 경기 일정 및 정보 수정</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div><label className="block text-xs font-bold text-purple-700 mb-1">원정 경기명 (제목)</label><input type="text" value={matchData.title} onChange={e=>setMatchData({...matchData, title:e.target.value})} className="w-full border p-2 rounded text-sm" placeholder="예: FC안양 원정버스" /></div>
            <div><label className="block text-xs font-bold text-red-600 mb-1">경기 일자 (필수)</label><input type="date" value={matchData.match_date} onChange={e=>setMatchData({...matchData, match_date:e.target.value})} className="w-full border p-2 rounded text-sm" required /></div>
            <div><label className="block text-xs font-bold text-purple-700 mb-1">입금 계좌번호</label><input type="text" value={matchData.account_info} onChange={e=>setMatchData({...matchData, account_info:e.target.value})} className="w-full border p-2 rounded text-sm" /></div>
            <div><label className="block text-xs font-bold text-purple-700 mb-1">탑승 가격 (숫자만)</label><input type="number" value={matchData.price} onChange={e=>setMatchData({...matchData, price:Number(e.target.value)})} className="w-full border p-2 rounded text-sm" /></div>
            {/* 🔥 타임테이블 텍스트 에어리어로 변경 */}
            <div className="col-span-1 md:col-span-2"><label className="block text-xs font-bold text-purple-700 mb-1">타임테이블 (자유롭게 줄글 작성)</label><textarea value={matchData.departure_time} onChange={e=>setMatchData({...matchData, departure_time:e.target.value})} className="w-full border p-2 rounded text-sm" rows={5} placeholder="예: 오전 10시 출발&#13;&#10;오후 2시 도착" /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-white rounded border border-purple-100">
            <div><label className="block text-xs font-bold text-red-600 mb-1">인증회원 오픈 시간</label><input type="datetime-local" value={matchData.auth_open_time} onChange={e=>setMatchData({...matchData, auth_open_time:e.target.value})} className="w-full border p-2 rounded text-sm" /></div>
            <div><label className="block text-xs font-bold text-blue-600 mb-1">일반회원 오픈 시간</label><input type="datetime-local" value={matchData.user_open_time} onChange={e=>setMatchData({...matchData, user_open_time:e.target.value})} className="w-full border p-2 rounded text-sm" /></div>
            <div><label className="block text-xs font-bold text-gray-700 mb-1">예매 최종 마감 시간</label><input type="datetime-local" value={matchData.close_time} onChange={e=>setMatchData({...matchData, close_time:e.target.value})} className="w-full border p-2 rounded text-sm" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleMatchInfoSave} className="bg-purple-600 text-white font-bold px-6 py-2 rounded hover:bg-purple-700">수정 사항 저장하기</button>
            <button onClick={() => setShowMatchInfo(false)} className="border border-purple-300 text-purple-700 px-4 py-2 rounded">닫기</button>
          </div>
        </div>
      )}

      {/* 🔥 [수정] 배차 설정 NaN 에러 수정 */}
      {showSettings && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 shadow-inner">
          <h3 className="font-bold text-blue-800 mb-4 flex items-center"><Settings size={18} className="mr-2"/> 배차 및 호차별 정원 설정</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 pb-4 border-b border-blue-200">
            <div><label className="block text-sm font-bold text-gray-700 mb-1">운행할 호차 대수</label><input type="number" value={settingsData.busCount || ''} onChange={e => setSettingsData({...settingsData, busCount: e.target.value === '' ? '' : parseInt(e.target.value)} as any)} className="w-full border border-blue-300 p-2 rounded font-bold text-blue-700" min={1} /></div>
            <div className="col-span-2"><label className="block text-sm font-bold text-gray-700 mb-1">전체 총 탑승 정원 (아래 합계)</label><input type="number" value={settingsData.maxSeats || ''} readOnly className="w-full border border-gray-300 bg-gray-100 p-2 rounded font-bold text-gray-500 cursor-not-allowed" /></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
             {Array.from({ length: settingsData.busCount || 1 }).map((_, i) => (
                 <div key={i+1} className="bg-white p-3 rounded border border-blue-100 shadow-sm">
                   <label className="block text-xs font-bold text-blue-800 mb-1">{i+1}호차 최대 정원</label>
                   <input type="number" value={settingsData.capacities[i+1] || ''} onChange={e => setSettingsData({...settingsData, capacities: {...settingsData.capacities, [i+1]: e.target.value === '' ? '' : parseInt(e.target.value)}})} className="w-full border p-1 rounded text-center font-bold text-blue-600" />
                 </div>
             ))}
          </div>
          <div className="mt-5 flex gap-2"><button onClick={handleSettingsSave} className="bg-blue-600 text-white font-bold px-6 py-2 rounded">적용하기</button></div>
        </div>
      )}

      {showManualAdd && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 shadow-inner">
          <h3 className="font-bold text-red-700 mb-3 flex items-center"><UserPlus size={18} className="mr-2"/> 오프라인 인원 직접 추가</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <input type="text" value={manualData.name} onChange={e=>setManualData({...manualData, name:e.target.value})} placeholder="이름/모임명" className="border p-2 rounded text-sm col-span-2" />
            <input type="number" value={manualData.totalHeadcount || ''} onChange={e=>setManualData({...manualData, totalHeadcount: parseInt(e.target.value)})} placeholder="총 인원수" className="border p-2 rounded text-sm text-center font-bold text-red-600" min={1} />
            <select value={manualData.busNumber} onChange={e=>setManualData({...manualData, busNumber:e.target.value})} className="border p-2 rounded text-sm bg-white"><option value="">미정</option>{busOptions.map(num => <option key={num} value={num}>{num}호차</option>)}</select>
            <button onClick={handleManualAddSubmit} className="bg-black text-white font-bold rounded py-2 col-span-2">명단 등록</button>
          </div>
        </div>
      )}

      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide items-end border-b-2 border-gray-200">
        <button onClick={() => setFilterBus('ALL')} className={`whitespace-nowrap px-4 py-2 rounded-t-lg font-bold transition-colors ${filterBus === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>전체 명단</button>
        <button onClick={() => setFilterBus('UNASSIGNED')} className={`whitespace-nowrap px-4 py-2 rounded-t-lg font-bold transition-colors ${filterBus === 'UNASSIGNED' ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>미배정</button>
        {busOptions.map(num => {
          const cap = currentCapacities[num] || 44;
          const current = getBusCurrentHeadcount(num);
          const isFull = current >= cap;
          return (
            <button key={num} onClick={() => setFilterBus(num)} className={`whitespace-nowrap px-4 py-2 rounded-t-lg font-bold transition-colors flex flex-col items-center ${filterBus === num ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
              <div>{num}호차 <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${isFull ? 'bg-red-500 text-white' : 'bg-white text-gray-800'}`}>정원 {current}/{cap}</span></div>
            </button>
          )
        })}
        <button onClick={() => setFilterBus('CANCELLED')} className={`ml-auto whitespace-nowrap px-4 py-2 rounded-t-lg font-bold transition-colors border-l border-r border-t border-red-200 ${filterBus === 'CANCELLED' ? 'bg-red-50 text-red-600 border-b-white translate-y-[2px]' : 'bg-white text-red-400 hover:bg-red-50'}`}>
          <RefreshCcw size={14} className="inline mr-1"/> 취소/환불 ({cancelledApps.length})
        </button>
      </div>

      <div className={`rounded-b-xl rounded-tr-xl shadow border overflow-hidden ${filterBus === 'CANCELLED' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className={`${filterBus === 'CANCELLED' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'} border-b`}>
              <tr><th className="p-3 w-28 text-center">{filterBus === 'CANCELLED' ? '환불계좌' : '호차배정'}</th><th className="p-3">신청자 명단 (탑승 체크 / 부분 취소)</th><th className="p-3 text-center w-32">상태 관리</th></tr>
            </thead>
            <tbody>
              {filteredApplications.length === 0 ? <tr><td colSpan={4} className="p-10 text-center text-gray-400 bg-white">조회된 데이터가 없습니다.</td></tr> :
                filteredApplications.map((app: any) => (
                  <tr key={app.id} className={`border-b hover:bg-gray-50 bg-white ${filterBus === 'CANCELLED' ? 'opacity-80' : ''}`}>
                    <td className="p-3 text-center bg-gray-50 border-r align-middle">
                      {filterBus === 'CANCELLED' ? (<div className="text-xs font-bold text-red-600 break-all">{app.refund_account || '계좌없음'}</div>) : (
                        <select value={app.bus_number || ''} onChange={(e) => onUpdateBusNumber(app.id, e.target.value)} className="w-full p-2 border rounded text-center font-bold text-blue-700 focus:ring-blue-500 shadow-sm"><option value="">미정</option>{busOptions.map(num => <option key={num} value={num}>{num}호차</option>)}</select>
                      )}
                    </td>
                    <td className="p-3">
                      {/* 🔥 관리자 탑승체크 명확화 [탑승완료] 글씨 추가 */}
                      <div className="flex items-center justify-between mb-1 bg-white border border-gray-100 p-2 rounded shadow-sm">
                        <div className="flex items-center gap-2">
                          {filterBus !== 'CANCELLED' && app.status === '입금완료' && (
                            <button onClick={() => onToggleBoarding(app, -1)} className="focus:outline-none transition-colors" title="클릭하여 탑승 체크">
                              {app.rep_boarded ? (
                                <div className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded font-bold text-xs border border-green-200"><CheckSquare size={16} className="mr-1"/> 탑승완료</div>
                              ) : (
                                <div className="flex items-center text-gray-400 hover:text-blue-500 bg-gray-50 px-2 py-1 rounded text-xs border border-gray-200 transition-colors"><Square size={16} className="mr-1"/> 미탑승</div>
                              )}
                            </button>
                          )}
                          <strong className={`text-base ${app.rep_boarded ? 'text-green-700' : 'text-gray-900'}`}>[대표] {app.rep_name}</strong> {app.rep_phone && <span className="text-xs text-gray-500">({app.rep_phone})</span>}
                        </div>
                        {filterBus !== 'CANCELLED' && !app.rep_boarded && (<button onClick={() => onPartialCancel(app, -1)} className="text-red-400 hover:text-red-600 border border-red-200 px-2 py-1 rounded text-xs">취소</button>)}
                      </div>
                      
                      {app.companion_count > 0 && (
                        <div className="pl-3 border-l-2 border-gray-200 mt-2 space-y-1">
                          {app.companions_info.map((comp: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-xs text-gray-600 py-1.5 bg-gray-50 px-2 rounded">
                              <div className="flex items-center gap-2">
                                {filterBus !== 'CANCELLED' && app.status === '입금완료' && (
                                  <button onClick={() => onToggleBoarding(app, idx)} className="focus:outline-none transition-colors" title="클릭하여 탑승 체크">
                                    {comp.boarded ? (
                                      <div className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded font-bold text-xs border border-green-200"><CheckSquare size={16} className="mr-1"/> 탑승완료</div>
                                    ) : (
                                      <div className="flex items-center text-gray-400 hover:text-blue-500 bg-gray-50 px-2 py-1 rounded text-xs border border-gray-200 transition-colors"><Square size={16} className="mr-1"/> 미탑승</div>
                                    )}
                                  </button>
                                )}
                                <span className={comp.boarded ? 'text-green-700 font-bold' : ''}>동반자 {idx+1}. {comp.name} {comp.phone && `(${comp.phone})`}</span>
                              </div>
                              {filterBus !== 'CANCELLED' && !comp.boarded && (<button onClick={() => onPartialCancel(app, idx)} className="text-red-400 hover:text-red-600"><XCircle size={16}/></button>)}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center space-y-2 align-middle">
                       <select value={app.status} onChange={(e) => onUpdateStatus(app.id, e.target.value)} className={`border text-xs p-2 rounded w-full font-bold shadow-sm ${app.status === '입금완료' ? 'bg-green-50 text-green-700 border-green-200' : app.status === '취소요청' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white'}`}>
                         <option value="입금대기">입금대기</option><option value="입금완료">입금완료</option><option value="취소요청">취소요청</option><option value="환불완료">환불완료</option>
                       </select>
                       {filterBus === 'CANCELLED' && (<button onClick={() => onHardDelete(app.id)} className="text-xs text-gray-400 w-full hover:text-red-500 mt-2">영구삭제</button>)}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}