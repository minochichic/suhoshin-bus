'use client';

import React, { useState, useEffect } from 'react';
import { Users, Bus, Calendar, Clock, MapPin, CheckCircle, AlertCircle, Plus, Trash2, LogOut, ShieldAlert, Edit2, UserPlus, XCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// 1. 수파베이스 DB 연결
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

type UserRole = 'user' | 'auth_user' | 'admin';
type User = { role: UserRole; name: string } | null;

// 연락처 자동 하이픈 생성 함수
const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/[^\d]/g, ''); 
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(null);
  const [view, setView] = useState<'home' | 'applyForm' | 'adminDashboard'>('home');
  const [schedule, setSchedule] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  
  const [dataLoading, setDataLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);

  // DB 데이터 불러오기
  const fetchData = async () => {
    setDataLoading(true);
    const { data: matchData } = await supabase.from('matches').select('*').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(1).single();
    
    if (matchData) {
      setSchedule(matchData);
      const { data: resData } = await supabase.from('reservations')
        .select('*')
        .eq('match_id', matchData.id)
        .order('bus_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (resData) setApplications(resData);
    }
    setDataLoading(false);
  };

  // SSO 티켓 검증 로직
  useEffect(() => {
    const verifyTicket = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const ticket = urlParams.get('ticket');

      if (!ticket) {
        setAuthLoading(false); 
        return; 
      }

      // 개발자 테스트용 티켓
      if (ticket === 'test_admin') {
        setCurrentUser({ role: 'admin', name: '테스트관리자' });
        setView('adminDashboard');
        setAuthLoading(false);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      if (ticket === 'test_user') {
        setCurrentUser({ role: 'auth_user', name: '테스트정회원' });
        setView('home');
        setAuthLoading(false);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      // 실제 API 통신
      try {
        const response = await fetch('https://fcseoul12.com/api/sso/verify-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket: ticket, secret_key: 'FCSeoul_Bus_2026_Secret!' })
        });
        const result = await response.json();
        
        if (result.status === 'success') {
          setCurrentUser({ name: result.data.nickname, role: result.data.role as UserRole });
          setView(result.data.role === 'admin' ? 'adminDashboard' : 'home');
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          alert('로그인 정보가 만료되었습니다. 다시 접속해주세요.');
        }
      } catch (error) {
        console.error('인증 API 대기중...');
      } finally {
        setAuthLoading(false);
      }
    };
    
    fetchData().then(() => verifyTicket());
  }, []);

  // 통계 계산 로직 (일반, 수동, 총합)
  const generalSeats = applications.filter(app => app.user_id !== '관리자수동추가').reduce((total, app) => total + 1 + (app.companion_count || 0), 0);
  const manualSeats = applications.filter(app => app.user_id === '관리자수동추가').reduce((total, app) => total + 1 + (app.companion_count || 0), 0);
  const totalReservedSeats = generalSeats + manualSeats;

  const handleLogout = () => {
    setCurrentUser(null);
    window.location.href = 'https://fcseoul12.com'; 
  };

  // 데이터 저장 함수 (사용자 직접 신청 & 관리자 수동 일괄 추가 공용)
  const submitApplication = async (applicationData: any) => {
    const isWaiting = totalReservedSeats >= schedule.max_seats; 
    
    let finalCompanions = applicationData.companions;
    let compCount = finalCompanions.length;
    
    // 수동 추가(소모임)일 경우 이름 없이 숫자만으로 동반자 배열 자동 생성
    if (applicationData.isAdminAdd && applicationData.totalHeadcount > 1) {
      compCount = applicationData.totalHeadcount - 1;
      finalCompanions = Array.from({ length: compCount }).map((_, i) => ({ 
        name: `소모임 인원 ${i+1}`, 
        phone: '', 
        type: applicationData.representative.type, 
        location: applicationData.representative.location 
      }));
    }

    if (!applicationData.isAdminAdd && !isWaiting && totalReservedSeats + 1 + compCount > schedule.max_seats) {
        alert(`현재 잔여 좌석이 부족하여 신청 인원 전체가 대기자로 넘어갑니다.`);
    }

    const insertData = {
      match_id: schedule.id,
      user_id: applicationData.isAdminAdd ? '관리자수동추가' : currentUser?.name,
      rep_name: applicationData.representative.name,
      rep_phone: applicationData.representative.phone,
      boarding_type: applicationData.representative.type,
      boarding_location: applicationData.representative.location,
      companion_count: compCount,
      companions_info: finalCompanions,
      is_minor: applicationData.isMinor,
      guardian_phone: applicationData.guardianPhone,
      refund_account: applicationData.refundAccount || null,
      is_waiting: applicationData.isAdminAdd ? false : totalReservedSeats >= schedule.max_seats,
      status: applicationData.isAdminAdd ? '입금완료' : '입금대기',
      bus_number: applicationData.busNumber || null
    };

    const { error } = await supabase.from('reservations').insert([insertData]);

    if (error) {
      alert('오류가 발생했습니다: ' + error.message);
    } else {
      if(!applicationData.isAdminAdd) alert(insertData.is_waiting ? '정원이 마감되어 [대기자]로 신청되었습니다. 추가 배차 확정 시 안내해 드립니다.' : '신청이 완료되었습니다!');
      fetchData();
      if(!applicationData.isAdminAdd) setView('home');
    }
  };

  // 부분 취소 및 승계 로직
  const handlePartialCancel = async (app: any, targetIdx: number) => {
    if (!window.confirm(targetIdx === -1 ? '대표자를 취소하시겠습니까? (동반자가 있다면 1번 동반자가 대표자로 승계됩니다)' : '해당 동반자를 취소하시겠습니까?')) return;

    if (targetIdx === -1) {
      // 대표자 취소
      if (app.companion_count === 0) {
         // 동반자 없으면 전체 삭제
         await supabase.from('reservations').delete().eq('id', app.id);
      } else {
         // 동반자가 있으면 승계 (첫 번째 동반자를 대표자로)
         const newRep = app.companions_info[0];
         const newCompanions = app.companions_info.slice(1);
         await supabase.from('reservations').update({
           rep_name: newRep.name || '이름없음(승계됨)',
           rep_phone: newRep.phone || app.rep_phone,
           boarding_type: newRep.type || app.boarding_type,
           boarding_location: newRep.location || app.boarding_location,
           companion_count: app.companion_count - 1,
           companions_info: newCompanions
         }).eq('id', app.id);
      }
    } else {
      // 동반자 개별 취소
      const newCompanions = [...app.companions_info];
      newCompanions.splice(targetIdx, 1);
      await supabase.from('reservations').update({
        companion_count: app.companion_count - 1,
        companions_info: newCompanions
      }).eq('id', app.id);
    }
    fetchData();
  };

  const updateApplicationStatus = async (id: string, newStatus: string) => {
    await supabase.from('reservations').update({ status: newStatus }).eq('id', id);
    fetchData();
  };

  const updateBusNumber = async (id: string, busNum: string) => {
    const val = busNum === '' ? null : parseInt(busNum, 10);
    await supabase.from('reservations').update({ bus_number: val }).eq('id', id);
    fetchData();
  };

  const updateBusSettings = async () => {
    const newSeats = window.prompt(`현재 최대 배차 인원(정원)은 ${schedule.max_seats}명입니다.\n변경할 배차 인원(숫자)을 입력하세요:`, schedule.max_seats);
    const newBuses = window.prompt(`현재 배차 대수는 ${schedule.bus_count || 1}대입니다.\n운영할 버스 대수를 입력하세요 (예: 2):`, schedule.bus_count || 1);
    
    if (newSeats && newBuses && !isNaN(Number(newSeats)) && !isNaN(Number(newBuses))) {
      await supabase.from('matches').update({ max_seats: Number(newSeats), bus_count: Number(newBuses) }).eq('id', schedule.id);
      fetchData();
      alert('배차 설정이 성공적으로 수정되었습니다.');
    }
  };

  const deleteApplication = async (id: string) => {
    if(window.confirm('정말 이 신청 전체를 DB에서 완전 삭제하시겠습니까?')) {
      await supabase.from('reservations').delete().eq('id', id);
      fetchData();
    }
  };

  if (dataLoading || authLoading) return <div className="min-h-screen bg-black flex items-center justify-center font-bold text-xl text-red-600">수호신 인증 정보를 확인 중입니다...</div>;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full text-center border-t-8 border-red-600">
          <div className="flex justify-center mb-4"><ShieldAlert size={48} className="text-red-600" /></div>
          <h1 className="text-2xl font-black mb-2 text-black">접근 권한 없음</h1>
          <p className="text-gray-500 mb-8 text-sm">정상적인 접근이 아닙니다.<br/>수호신 홈페이지를 통해 로그인 후 접속해주세요.</p>
          <a href="https://fcseoul12.com" className="block w-full py-3 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors">홈페이지로 돌아가기</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800">
      <nav className="bg-black text-white shadow-md border-b-4 border-red-600">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3 font-black text-xl cursor-pointer" onClick={() => setView(currentUser.role === 'admin' ? 'adminDashboard' : 'home')}>
            <img src="/logo.png" alt="FC Seoul" className="w-8 h-8 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
            <span className="text-red-600 tracking-tight">수호신 <span className="text-white">원정버스</span></span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm bg-gray-800 border border-gray-700 px-3 py-1 rounded-full text-red-400 font-bold hidden sm:inline-block">
              {currentUser.name} ({currentUser.role === 'admin' ? '관리자' : currentUser.role === 'auth_user' ? '인증회원' : '일반회원'})
            </span>
            <button onClick={handleLogout} className="flex items-center space-x-1 hover:text-red-500 text-sm transition-colors"><LogOut size={16} /> <span>돌아가기</span></button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!schedule && view !== 'adminDashboard' ? (
          <div className="text-center py-20"><h2 className="text-2xl font-bold text-gray-600">현재 예정된 원정버스가 없습니다.</h2></div>
        ) : (
          <>
            {view === 'home' && <UserHome schedule={schedule} reservedSeats={totalReservedSeats} onApplyClick={() => setView('applyForm')} currentUser={currentUser} applications={applications} onPartialCancel={handlePartialCancel} />}
            {view === 'applyForm' && <ApplicationForm schedule={schedule} reservedSeats={totalReservedSeats} onCancel={() => setView('home')} onSubmit={submitApplication} currentUser={currentUser} />}
            {view === 'adminDashboard' && <AdminDashboard schedule={schedule} applications={applications} stats={{ generalSeats, manualSeats, totalReservedSeats }} onUpdateStatus={updateApplicationStatus} onUpdateBusNumber={updateBusNumber} onDelete={deleteApplication} onUpdateSettings={updateBusSettings} onManualAdd={submitApplication} onPartialCancel={handlePartialCancel} />}
          </>
        )}
      </main>
    </div>
  );
}

// ================== 일반 유저용 화면 컴포넌트 ==================

function UserHome({ schedule, reservedSeats, onApplyClick, currentUser, applications, onPartialCancel }: any) {
  const isSoldOut = reservedSeats >= schedule.max_seats; 
  const myApplications = applications.filter((app: any) => app.user_id === currentUser.name);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-600">
        <h2 className="text-lg font-bold mb-2 flex items-center text-black"><AlertCircle size={20} className="mr-2 text-red-600" /> 수호신 원정버스 필수 규정</h2>
        <ul className="list-disc pl-5 text-gray-600 space-y-2 text-sm">
          <li>환불 규정: 24시간 이내 100% / 탑승문자 발송 전 50% / 출발 3일 전 환불불가</li>
          <li>탑승자 식별을 위해 개인 양도는 절대 불가합니다.</li>
          <li>미성년자는 신청 시 보호자 연락처를 반드시 기재해야 합니다.</li>
          <li>인원 초과 시 대기자로 등록되며, 배차 실패 시 100% 환불됩니다.</li>
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
        <div className="bg-black text-white px-6 py-4 flex justify-between items-center border-b-2 border-red-600">
          <h2 className="text-xl font-black tracking-tight">{schedule.title}</h2>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${isSoldOut ? 'bg-red-600 text-white' : 'bg-white text-red-600'}`}>
            {isSoldOut ? '마감 / 대기자 접수중' : '신청가능'}
          </span>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Clock className="text-red-600 mt-1" size={20} />
              <div><p className="font-bold text-gray-800">시간표</p><p className="text-sm text-gray-600">출발: {schedule.departure_time}</p></div>
            </div>
            <div className="flex items-start space-x-3">
              <MapPin className="text-red-600 mt-1" size={20} />
              <div><p className="font-bold text-gray-800">정보</p><p className="text-sm text-gray-600">가격: {schedule.price.toLocaleString()}원</p><p className="text-sm font-bold text-red-600 mt-1">계좌: {schedule.account_info}</p></div>
            </div>
          </div>
          
          <div className="flex flex-col justify-center items-center bg-gray-50 rounded-lg p-6 border border-gray-200">
            <div className="text-center mb-4">
              <p className="text-gray-500 text-sm font-bold mb-1">현재 예매 현황 (최대 {schedule.max_seats}석)</p>
              <p className="text-4xl font-black text-black"><span className={isSoldOut ? 'text-red-600' : 'text-black'}>{reservedSeats}</span> <span className="text-xl text-gray-400">/ {schedule.max_seats}</span></p>
            </div>
            <button onClick={onApplyClick} disabled={currentUser.role === 'admin'} className="w-full py-3 rounded-lg font-bold text-white transition-colors bg-red-600 hover:bg-red-700 shadow-md">
              {isSoldOut ? '대기자로 신청하기' : '원정버스 신청하기'}
            </button>
            {isSoldOut && <p className="text-xs text-red-600 font-bold mt-2">정원이 마감되어 현재 대기자 신청만 가능합니다.</p>}
          </div>
        </div>
      </div>

      {myApplications.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
          <h2 className="text-lg font-black mb-4">나의 신청 내역 (개별 취소 가능)</h2>
          <div className="space-y-3">
            {myApplications.map((app: any) => (
              <div key={app.id} className="border-2 border-gray-100 rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50">
                <div className="w-full">
                  <div className="flex justify-between items-center border-b pb-2 mb-2">
                    <span className="font-bold text-blue-600">{app.bus_number ? `🚌 ${app.bus_number}호차 배정완료` : '호차 배정 대기중'}</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${app.status === '입금완료' ? 'bg-green-100 text-green-700' : app.status === '취소요청' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {app.status} {app.is_waiting && '(대기자)'}
                    </span>
                  </div>
                  
                  {/* 대표자 부분 취소 */}
                  <div className="flex justify-between items-center py-1">
                    <p className="font-bold text-lg">[대표] {app.rep_name} <span className="text-sm font-normal text-gray-500">({app.boarding_type})</span></p>
                    <button onClick={() => onPartialCancel(app, -1)} className="text-red-500 hover:text-red-700 flex items-center text-sm"><XCircle size={16} className="mr-1"/> 취소요청</button>
                  </div>
                  
                  {/* 동반자 부분 취소 */}
                  {app.companions_info?.map((comp: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center py-1 text-sm text-gray-700 pl-4 border-l-2 border-gray-300 ml-2">
                      <p>동반자: {comp.name} <span className="text-xs text-gray-500">({comp.type})</span></p>
                      <button onClick={() => onPartialCancel(app, idx)} className="text-red-400 hover:text-red-600 flex items-center text-xs"><XCircle size={14} className="mr-1"/> 취소요청</button>
                    </div>
                  ))}
                  <p className="text-sm text-gray-500 mt-2">총 결제금액: {((1 + app.companion_count) * schedule.price).toLocaleString()}원</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ================== 일반 유저용 상세 신청 폼 ==================

function ApplicationForm({ schedule, reservedSeats, onCancel, onSubmit, currentUser }: any) {
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
    if(isMinor && !guardianPhone) return alert('미성년자는 보호자 연락처를 반드시 입력해야 합니다.');
    if(isSoldOut && !refundAccount) return alert('대기자 배차 및 환불 처리를 위한 계좌번호를 입력해주세요.');
    if(!privacyAgreed) return alert('개인정보 수집 및 이용에 동의해야 신청이 가능합니다.');

    onSubmit({ representative: rep, companions, isMinor, guardianPhone, refundAccount, isAdminAdd: false });
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
      <div className="bg-black border-b-4 border-red-600 p-4 text-white flex justify-between items-center">
        <div><h2 className="text-xl font-black">버스 탑승 신청</h2><p className="text-sm text-gray-400">{schedule.title}</p></div>
        {isSoldOut && <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse">현재 대기자 접수 중</span>}
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        <section>
          <h3 className="text-lg font-black border-b-2 border-gray-100 pb-2 mb-4 flex items-center"><Users className="mr-2 text-red-600" size={20} /> 대표자 정보</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">성함</label>
              <input type="text" value={rep.name} onChange={e => setRep({...rep, name: e.target.value})} className="w-full border p-2 rounded focus:border-red-600 focus:ring-red-600 placeholder-gray-300" placeholder="홍길동" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">연락처</label>
              <input type="text" value={rep.phone} onChange={e => setRep({...rep, phone: formatPhoneNumber(e.target.value)})} maxLength={13} className="w-full border p-2 rounded focus:border-red-600 focus:ring-red-600 placeholder-gray-300" required placeholder="010-0000-0000"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">탑승 유형</label>
              <select value={rep.type} onChange={e => setRep({...rep, type: e.target.value})} className="w-full border p-2 rounded focus:border-red-600 focus:ring-red-600">
                <option value="왕복">왕복</option><option value="상행(서울행)">상행(서울행)</option><option value="하행(원정행)">하행(원정행)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">탑승지</label>
              <select value={rep.location} onChange={e => setRep({...rep, location: e.target.value})} className="w-full border p-2 rounded focus:border-red-600 focus:ring-red-600">
                <option value="서울월드컵경기장">서울월드컵경기장</option>
                <option value="서초">서초</option>
              </select>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-md font-bold mb-3 flex items-center text-red-600"><AlertCircle className="mr-2" size={18} /> 필수 추가 정보</h3>
          <div className="space-y-4">
            <div>
              <label className="flex items-center space-x-2 text-sm font-bold text-gray-700 cursor-pointer">
                <input type="checkbox" checked={isMinor} onChange={e => setIsMinor(e.target.checked)} className="rounded text-red-600 focus:ring-red-600 w-4 h-4" />
                <span>미성년자 입니까? (체크 시 보호자 동의 필요)</span>
              </label>
              {isMinor && <input type="text" value={guardianPhone} onChange={e => setGuardianPhone(formatPhoneNumber(e.target.value))} maxLength={13} className="mt-2 w-full border p-2 rounded text-sm placeholder-gray-300" placeholder="보호자 연락처 (010-0000-0000)" required />}
            </div>
            
            {isSoldOut && (
              <div className="bg-red-50 p-3 rounded border border-red-200">
                <label className="block text-sm font-bold text-red-700 mb-1">배차 대기 환불 계좌 (필수)</label>
                <input type="text" value={refundAccount} onChange={e => setRefundAccount(e.target.value)} className="w-full border p-2 rounded text-sm focus:border-red-600 placeholder-gray-300" placeholder="은행명 / 계좌번호 / 예금주 (예: 신한은행 110-123-456 홍길동)" required />
                <p className="text-xs text-red-500 mt-1">정원이 마감되었습니다. 추가 배차 실패 시 입력하신 계좌로 전액 환불됩니다.</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center border-b-2 border-gray-100 pb-2 mb-4">
            <h3 className="text-lg font-black">동반 탑승자 <span className="text-sm font-normal text-gray-500">(총 {companions.length}명)</span></h3>
            <button type="button" onClick={() => setCompanions([...companions, { id: Date.now(), name: '', phone: '', type: '왕복', location: '서울월드컵경기장' }])} className="text-sm bg-black text-white px-3 py-1 rounded hover:bg-gray-800"><Plus size={16} className="inline mr-1" />인원 추가</button>
          </div>
          {companions.map((comp, idx) => (
             <div key={comp.id} className="relative border p-3 rounded mb-2 bg-white">
               <button type="button" onClick={() => setCompanions(companions.filter(c => c.id !== comp.id))} className="absolute top-2 right-2 text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
               <p className="text-xs font-bold text-gray-500 mb-2">동반자 {idx + 1}</p>
               <div className="grid grid-cols-2 gap-2 mt-2">
                 <input type="text" value={comp.name} onChange={e => setCompanions(companions.map(c => c.id === comp.id ? {...c, name: e.target.value} : c))} className="border p-2 text-sm rounded placeholder-gray-300" placeholder="홍길동" required />
                 <input type="text" value={comp.phone} onChange={e => setCompanions(companions.map(c => c.id === comp.id ? {...c, phone: formatPhoneNumber(e.target.value)} : c))} maxLength={13} className="border p-2 text-sm rounded placeholder-gray-300" placeholder="010-0000-0000" required />
                 <select value={comp.type} onChange={e => setCompanions(companions.map(c => c.id === comp.id ? {...c, type: e.target.value} : c))} className="border p-2 text-sm rounded">
                    <option value="왕복">왕복</option><option value="상행(서울행)">상행(서울행)</option><option value="하행(원정행)">하행(원정행)</option>
                 </select>
                 <select value={comp.location} onChange={e => setCompanions(companions.map(c => c.id === comp.id ? {...c, location: e.target.value} : c))} className="border p-2 text-sm rounded">
                    <option value="서울월드컵경기장">서울월드컵경기장</option><option value="서초">서초</option>
                 </select>
               </div>
             </div>
          ))}
        </section>

        <section className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
          <label className="flex items-start space-x-2 cursor-pointer">
            <input type="checkbox" checked={privacyAgreed} onChange={e => setPrivacyAgreed(e.target.checked)} required className="mt-1 rounded text-red-600 focus:ring-red-600 w-4 h-4" />
            <span className="text-gray-700">
              [필수] 개인정보 수집 및 이용 동의<br/>
              <span className="text-xs text-gray-500">
                1. 수집목적: 수호신 원정버스 탑승자 식별, 비상연락 및 환불 처리<br/>
                2. 수집항목: 성명, 연락처, 환불계좌 (필요 시 보호자 연락처)<br/>
                3. 보유기간: 해당 원정 경기 종료 및 정산 완료 후 즉시 파기
              </span>
            </span>
          </label>
        </section>

        <div className="bg-black p-4 rounded-lg flex justify-between items-center text-white">
          <div><p className="text-sm text-gray-400">총 결제 예정 금액</p><p className="text-2xl font-black text-red-500">{((1 + companions.length) * schedule.price).toLocaleString()}원</p></div>
          <div className="space-x-2 flex">
            <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-700 rounded text-gray-300 hover:bg-gray-800">취소</button>
            <button type="submit" className="px-6 py-2 bg-red-600 font-bold rounded hover:bg-red-700">{isSoldOut ? '대기자 등록' : '신청 완료'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ================== 관리자용 통합 대시보드 ==================

function AdminDashboard({ schedule, applications, stats, onUpdateStatus, onUpdateBusNumber, onDelete, onUpdateSettings, onManualAdd, onPartialCancel }: any) {
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualData, setManualData] = useState({ name: '', phone: '', type: '왕복', location: '서울월드컵경기장', busNumber: '', totalHeadcount: 1 });

  // 드롭다운에 쓸 호차 목록 생성 (예: 3대면 [1, 2, 3])
  const busOptions = Array.from({ length: schedule.bus_count || 1 }, (_, i) => i + 1);

  const handleManualAddSubmit = () => {
    if(!manualData.name) return alert('이름이나 소모임명을 입력해주세요.');
    onManualAdd({ representative: manualData, companions: [], isMinor: false, isAdminAdd: true, busNumber: manualData.busNumber, totalHeadcount: manualData.totalHeadcount });
    setShowManualAdd(false);
    setManualData({ name: '', phone: '', type: '왕복', location: '서울월드컵경기장', busNumber: '', totalHeadcount: 1 });
  };

  return (
    <div className="space-y-6">
      <div className="bg-black text-white p-4 rounded-xl border-l-4 border-red-600 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-md">
        <div>
          <h2 className="text-xl font-black"><ShieldAlert className="inline mr-2 text-red-600" size={24} /> 관리자 패널</h2>
          <p className="text-sm text-gray-400 mt-1">일반: {stats.generalSeats}명 + 수동추가: {stats.manualSeats}명 = <span className="text-red-400 text-lg font-bold">총 {stats.totalReservedSeats}명</span> / 최대 {schedule.max_seats}석</p>
          <p className="text-sm text-gray-400 mt-1">배차 운행: 총 {schedule.bus_count || 1}대</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onUpdateSettings} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm"><Edit2 size={14} className="inline mr-1"/> 배차/인원 설정</button>
          <button onClick={() => setShowManualAdd(!showManualAdd)} className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm font-bold"><UserPlus size={14} className="inline mr-1"/> 소모임/수동 추가</button>
        </div>
      </div>

      {showManualAdd && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-inner">
          <h3 className="font-bold text-red-700 mb-2">대규모/오프라인 인원 직접 추가</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <input type="text" value={manualData.name} onChange={e=>setManualData({...manualData, name:e.target.value})} placeholder="이름/모임명" className="border p-2 rounded text-sm col-span-2" />
            <input type="number" value={manualData.totalHeadcount} onChange={e=>setManualData({...manualData, totalHeadcount: parseInt(e.target.value)})} placeholder="총 인원수" className="border p-2 rounded text-sm text-center font-bold text-blue-600" title="총 인원수" />
            <select value={manualData.busNumber} onChange={e=>setManualData({...manualData, busNumber:e.target.value})} className="border p-2 rounded text-sm bg-white">
              <option value="">호차 미정</option>
              {busOptions.map(num => <option key={num} value={num}>{num}호차</option>)}
            </select>
            <button onClick={handleManualAddSubmit} className="bg-black text-white font-bold rounded py-2 col-span-2 hover:bg-gray-800">일괄 등록</button>
          </div>
          <p className="text-xs text-gray-500 mt-2">총 인원수를 입력하면 자동으로 동반자 수가 계산되어 통계에 반영됩니다.</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-gray-100 text-gray-600 border-b">
              <tr>
                <th className="p-3 w-24 text-center">호차배정</th>
                <th className="p-3">신청자 및 동반자 명단 (개별 취소)</th>
                <th className="p-3 text-center">승인/관리</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 ? <tr><td colSpan={3} className="p-8 text-center text-gray-400">신청자가 없습니다.</td></tr> :
                applications.map((app: any) => (
                <tr key={app.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-center bg-gray-50 border-r align-top">
                    <span className="text-xs font-bold text-gray-500 block mb-1">배정</span>
                    <select value={app.bus_number || ''} onChange={(e) => onUpdateBusNumber(app.id, e.target.value)} className="w-full p-1 border rounded text-center font-bold text-red-600 bg-white shadow-sm focus:ring-red-600">
                      <option value="">미정</option>
                      {busOptions.map(num => <option key={num} value={num}>{num}호차</option>)}
                    </select>
                  </td>
                  <td className="p-3 align-top">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <span className={`px-2 py-1 text-xs rounded font-bold mr-2 ${app.status === '입금완료' ? 'bg-green-100 text-green-700' : app.status === '취소요청' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{app.status}</span>
                        {app.is_waiting && <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded font-bold mr-2">대기자</span>}
                        <strong className="text-base">[대표] {app.rep_name}</strong> {app.rep_phone && <span className="text-xs text-gray-500">({app.rep_phone})</span>}
                      </div>
                      <button onClick={() => onPartialCancel(app, -1)} className="text-red-400 hover:text-red-600 ml-2" title="대표자 취소"><XCircle size={18}/></button>
                    </div>
                    <div className="text-xs text-gray-500 mb-2 pl-1">{app.boarding_type} / 탑승지: {app.boarding_location}</div>
                    
                    {app.companion_count > 0 && (
                      <div className="pl-3 border-l-2 border-gray-200 mt-2 space-y-1 bg-gray-50 p-2 rounded">
                        <p className="text-xs font-bold text-gray-500 mb-1">동반자 ({app.companion_count}명)</p>
                        {app.companions_info.map((comp: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-xs text-gray-700">
                            <span>{idx+1}. {comp.name} {comp.phone && `(${comp.phone})`} - {comp.type}</span>
                            <button onClick={() => onPartialCancel(app, idx)} className="text-red-300 hover:text-red-500" title="취소"><XCircle size={14}/></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {app.refund_account && <div className="text-xs text-blue-600 font-normal mt-2">💰 환불계좌: {app.refund_account}</div>}
                  </td>
                  <td className="p-3 text-center space-y-2 align-top">
                     <select value={app.status} onChange={(e) => onUpdateStatus(app.id, e.target.value)} className="border text-xs p-1 rounded w-full bg-white focus:ring-red-600">
                       <option value="입금대기">입금대기</option><option value="입금완료">입금완료</option><option value="취소요청">취소요청</option><option value="환불완료">환불완료</option>
                     </select>
                     <button onClick={() => onDelete(app.id)} className="text-xs text-red-500 bg-red-50 p-1 w-full rounded hover:text-red-700">전체 삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}