'use client';

import React, { useState, useEffect } from 'react';
import { Users, Bus, Calendar, Clock, MapPin, CheckCircle, AlertCircle, Plus, Trash2, LogOut, ShieldAlert } from 'lucide-react';
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

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(null);
  const [view, setView] = useState<'home' | 'applyForm' | 'adminDashboard'>('home');
  const [schedule, setSchedule] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  
  const [dataLoading, setDataLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true); // SSO 인증 로딩 상태

  const fetchData = async () => {
    setDataLoading(true);
    const { data: matchData } = await supabase.from('matches').select('*').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(1).single();
    
    if (matchData) {
      setSchedule(matchData);
      const { data: resData } = await supabase.from('reservations').select('*').eq('match_id', matchData.id);
      if (resData) setApplications(resData);
    }
    setDataLoading(false);
  };

  // 🔒 2. 대망의 SSO 티켓 검증 로직
  useEffect(() => {
    const verifyTicket = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const ticket = urlParams.get('ticket');

      if (!ticket) {
        setAuthLoading(false); // 티켓이 없으면 인증 실패 (접근 거부 화면 노출)
        return; 
      }

      // 🛠️ [개발자 테스트용 코드] 실제 API가 완성되기 전 테스트를 위한 만능 티켓
      if (ticket === 'test_admin') {
        setCurrentUser({ role: 'admin', name: '테스트관리자' });
        setView('adminDashboard');
        setAuthLoading(false);
        window.history.replaceState({}, document.title, window.location.pathname); // 주소창 티켓 삭제
        return;
      }
      if (ticket === 'test_user') {
        setCurrentUser({ role: 'auth_user', name: '테스트정회원' });
        setView('home');
        setAuthLoading(false);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      // 🚀 [실제 서비스용 코드] 본진 서버(fcseoul12.com) API와 통신
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
          window.history.replaceState({}, document.title, window.location.pathname); // 1회용 티켓 흔적 지우기
        } else {
          alert('로그인 정보가 만료되었습니다. 수호신 홈페이지에서 다시 접속해주세요.');
        }
      } catch (error) {
        // 현재는 API가 없으므로 무조건 여기로 빠집니다 (테스트용 콘솔 에러만 출력)
        console.error('인증 API 대기중...');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchData().then(() => verifyTicket());
  }, []);

  const totalReservedSeats = applications.reduce((total, app) => total + 1 + (app.companion_count || 0), 0);

  const handleLogout = () => {
    setCurrentUser(null);
    window.location.href = 'https://fcseoul12.com'; // 로그아웃 시 본진으로 돌려보냄
  };

  const submitApplication = async (applicationData: any) => {
    const isWaiting = totalReservedSeats >= schedule.max_seats; 
    
    if (!isWaiting && totalReservedSeats + 1 + applicationData.companions.length > schedule.max_seats) {
        alert(`현재 잔여 좌석이 ${schedule.max_seats - totalReservedSeats}석밖에 남지 않아 신청 인원 전체가 대기자로 넘어갑니다.`);
    }

    const insertData = {
      match_id: schedule.id,
      user_id: currentUser?.name,
      rep_name: applicationData.representative.name,
      rep_phone: applicationData.representative.phone,
      boarding_type: applicationData.representative.type,
      boarding_location: applicationData.representative.location,
      companion_count: applicationData.companions.length,
      companions_info: applicationData.companions,
      is_minor: applicationData.isMinor,
      guardian_phone: applicationData.guardianPhone,
      refund_account: applicationData.refundAccount || null,
      is_waiting: totalReservedSeats >= schedule.max_seats,
      status: '입금대기'
    };

    const { error } = await supabase.from('reservations').insert([insertData]);

    if (error) {
      alert('오류가 발생했습니다: ' + error.message);
    } else {
      alert(insertData.is_waiting ? '정원이 마감되어 [대기자]로 신청되었습니다. 추가 배차 확정 시 안내해 드립니다.' : '신청이 완료되었습니다!');
      fetchData();
      setView('home');
    }
  };

  const updateApplicationStatus = async (id: string, newStatus: string) => {
    await supabase.from('reservations').update({ status: newStatus }).eq('id', id);
    fetchData();
  };

  const deleteApplication = async (id: string) => {
    if(window.confirm('정말 이 신청을 DB에서 완전 삭제하시겠습니까? (좌석이 1자리 비게 됩니다)')) {
      await supabase.from('reservations').delete().eq('id', id);
      fetchData();
    }
  };

  if (dataLoading || authLoading) return <div className="min-h-screen bg-black flex items-center justify-center font-bold text-xl text-red-600">수호신 인증 정보를 확인 중입니다...</div>;

  // ⛔ 티켓 없이 접속한 사람을 쫓아내는 철통 방어 화면
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full text-center border-t-8 border-red-600">
          <div className="flex justify-center mb-4"><ShieldAlert size={48} className="text-red-600" /></div>
          <h1 className="text-2xl font-black mb-2 text-black">접근 권한 없음</h1>
          <p className="text-gray-500 mb-8 text-sm">정상적인 접근이 아닙니다.<br/>수호신 홈페이지를 통해 로그인 후 접속해주세요.</p>
          <a href="https://fcseoul12.com" className="block w-full py-3 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors">
            수호신 홈페이지로 돌아가기
          </a>
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
            <button onClick={handleLogout} className="flex items-center space-x-1 hover:text-red-500 text-sm transition-colors">
              <LogOut size={16} /> <span>돌아가기</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!schedule && view !== 'adminDashboard' ? (
          <div className="text-center py-20"><h2 className="text-2xl font-bold text-gray-600">현재 예정된 원정버스가 없습니다.</h2></div>
        ) : (
          <>
            {view === 'home' && <UserHome schedule={schedule} reservedSeats={totalReservedSeats} onApplyClick={() => setView('applyForm')} currentUser={currentUser} applications={applications} onCancelRequest={updateApplicationStatus} />}
            {view === 'applyForm' && <ApplicationForm schedule={schedule} reservedSeats={totalReservedSeats} onCancel={() => setView('home')} onSubmit={submitApplication} currentUser={currentUser} />}
            {view === 'adminDashboard' && <AdminDashboard schedule={schedule} applications={applications} reservedSeats={totalReservedSeats} onUpdateStatus={updateApplicationStatus} onDelete={deleteApplication} />}
          </>
        )}
      </main>
    </div>
  );
}

// ================== 컴포넌트 분리 ==================

function UserHome({ schedule, reservedSeats, onApplyClick, currentUser, applications, onCancelRequest }: any) {
  const isSoldOut = reservedSeats >= schedule.max_seats; 
  const myApplications = applications.filter((app: any) => app.user_id === currentUser.name);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-600">
        <h2 className="text-lg font-bold mb-2 flex items-center text-black"><AlertCircle size={20} className="mr-2 text-red-600" /> 수호신 원정버스 필수 규정</h2>
        <ul className="list-disc pl-5 text-gray-600 space-y-2 text-sm">
          <li><strong>환불 규정:</strong> 24시간 이내 100% / 탑승문자 발송 전 50% / 출발 3일 전 환불불가</li>
          <li>탑승자 식별을 위해 <strong>개인 양도는 절대 불가</strong>합니다.</li>
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
          <h2 className="text-lg font-black mb-4">나의 신청 내역</h2>
          <div className="space-y-3">
            {myApplications.map((app: any) => (
              <div key={app.id} className="border-2 border-gray-100 rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                  <p className="font-bold text-lg">{app.rep_name} <span className="text-sm font-normal text-gray-500">외 {app.companion_count}명 {app.is_waiting && <span className="text-red-600 font-bold">(대기자)</span>}</span></p>
                  <p className="text-sm text-gray-500">결제금액: {((1 + app.companion_count) * schedule.price).toLocaleString()}원</p>
                </div>
                <div className="mt-3 md:mt-0 flex items-center space-x-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${app.status === '입금완료' ? 'bg-green-100 text-green-700' : app.status === '취소요청' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {app.status}
                  </span>
                  {app.status !== '취소요청' && app.status !== '환불완료' && (
                    <button onClick={() => { if(window.confirm('정말 취소를 요청하시겠습니까? 환불 규정에 따라 처리됩니다.')) onCancelRequest(app.id, '취소요청'); }} className="text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50">취소/환불 요청</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApplicationForm({ schedule, reservedSeats, onCancel, onSubmit, currentUser }: any) {
  const isSoldOut = reservedSeats >= schedule.max_seats; 
  const [rep, setRep] = useState({ name: '', phone: '', type: '왕복', location: '서울월드컵경기장' });
  const [companions, setCompanions] = useState<any[]>([]);
  const [isMinor, setIsMinor] = useState(false);
  const [guardianPhone, setGuardianPhone] = useState('');
  const [refundAccount, setRefundAccount] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(false); // 🔐 개인정보 동의 상태

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!rep.name || !rep.phone) return alert('대표자 정보를 입력해주세요.');
    if(rep.phone.length < 12) return alert('올바른 연락처를 입력해주세요.'); 
    if(isMinor && !guardianPhone) return alert('미성년자는 보호자 연락처를 반드시 입력해야 합니다.');
    if(isSoldOut && !refundAccount) return alert('대기자 배차 및 환불 처리를 위한 계좌번호를 입력해주세요.');
    if(!privacyAgreed) return alert('개인정보 수집 및 이용에 동의해야 신청이 가능합니다.');

    onSubmit({ representative: rep, companions, isMinor, guardianPhone, refundAccount });
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
                <p className="text-xs text-red-500 mt-1">* 정원이 마감되었습니다. 추가 배차 실패 시 입력하신 계좌로 전액 환불됩니다.</p>
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

        {/* 🔐 개인정보 동의 섹션 */}
        <section className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm">
          <label className="flex items-start space-x-2 cursor-pointer">
            <input type="checkbox" checked={privacyAgreed} onChange={e => setPrivacyAgreed(e.target.checked)} required className="mt-1 rounded text-red-600 focus:ring-red-600 w-4 h-4" />
            <span className="text-gray-700">
              <strong>[필수] 개인정보 수집 및 이용 동의</strong><br/>
              <span className="text-xs text-gray-500">
                1. 수집목적: 수호신 원정버스 탑승자 식별, 비상연락 및 환불 처리<br/>
                2. 수집항목: 성명, 연락처, 환불계좌 (필요 시 보호자 연락처)<br/>
                3. 보유기간: <strong>해당 원정 경기 종료 및 정산 완료 후 즉시 파기</strong>
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

function AdminDashboard({ schedule, applications, reservedSeats, onUpdateStatus, onDelete }: any) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center bg-black text-white p-4 rounded-xl border-l-4 border-red-600 shadow-md gap-4">
        <h2 className="text-xl font-black flex items-center"><ShieldAlert className="mr-2 text-red-600" size={24} /> 관리자 대시보드</h2>
        <div className="font-bold text-sm bg-gray-800 px-4 py-2 rounded">
          총 탑승인원: <span className="text-red-500 text-lg">{reservedSeats}</span> / {schedule.max_seats}명
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b flex justify-between font-bold text-gray-800">{schedule.title} 신청자 관리</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-gray-100 text-gray-600 border-b">
              <tr><th className="p-3">상태/유형</th><th className="p-3">신청자 정보 (대표 및 동반자)</th><th className="p-3">환불계좌 (대기자)</th><th className="p-3 text-center">승인/관리</th></tr>
            </thead>
            <tbody>
              {applications.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-gray-400">신청자가 없습니다.</td></tr> :
                applications.map((app: any) => (
                  <tr key={app.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 align-top">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-2 py-1 text-xs rounded font-bold ${app.status === '입금완료' ? 'bg-green-100 text-green-700' : app.status === '취소요청' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{app.status}</span>
                        {app.is_waiting && <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded font-bold">대기자</span>}
                        {app.is_minor && <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded font-bold">미성년자</span>}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-black text-base border-b pb-1 mb-1">
                        [대표] {app.rep_name} <span className="text-gray-500 font-normal text-sm ml-2">📞 {app.rep_phone}</span>
                        <div className="text-xs text-gray-500 font-normal mt-1">{app.boarding_type} / 탑승지: {app.boarding_location}</div>
                        {app.is_minor && <div className="text-xs text-orange-600 font-normal mt-1">보호자: {app.guardian_phone}</div>}
                      </div>
                      
                      {app.companion_count > 0 && (
                        <div className="mt-2 bg-gray-50 p-2 rounded border border-gray-100">
                          <p className="text-xs font-bold text-gray-500 mb-1">동반자 ({app.companion_count}명)</p>
                          {app.companions_info?.map((comp: any, idx: number) => (
                            <div key={idx} className="text-xs text-gray-700 mb-1 flex items-center gap-2">
                              <span className="bg-gray-200 px-1 rounded">{idx + 1}</span> 
                              <strong>{comp.name}</strong> ({comp.phone}) - {comp.type} / {comp.location}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-blue-600 align-top">
                      {app.refund_account ? `💰 ${app.refund_account}` : '-'}
                    </td>
                    <td className="p-3 text-center space-y-2 align-top">
                       <select value={app.status} onChange={(e) => onUpdateStatus(app.id, e.target.value)} className="border text-xs p-1 rounded w-full bg-white focus:ring-red-600 focus:border-red-600">
                         <option value="입금대기">입금대기</option><option value="입금완료">입금완료</option><option value="취소요청">취소요청</option><option value="환불완료">환불완료</option>
                       </select>
                       <button onClick={() => onDelete(app.id)} className="text-xs text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded w-full">DB 완전삭제</button>
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