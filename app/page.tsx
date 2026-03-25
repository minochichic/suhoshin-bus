'use client';

import React, { useState } from 'react';
import { Users, Bus, Calendar, Clock, MapPin, CheckCircle, AlertCircle, Plus, Trash2, LogOut, ShieldAlert } from 'lucide-react';

// 임시 버스 일정 데이터
const INITIAL_SCHEDULE = {
  id: 1,
  matchName: 'FC서울 vs FC안양',
  date: '2026-03-26',
  openTimeAuth: '2026-03-26T15:00:00',
  openTimeNormal: '2026-03-26T17:00:00',
  departureTime: '10:30',
  arrivalTime: '11:30',
  returnTime: '경기 종료 후 즉시',
  returnArrivalTime: '17:30',
  price: 15000,
  maxSeats: 44,
  accountInfo: '오픈 후 공개',
  status: 'OPEN',
};

type UserRole = 'user' | 'auth_user' | 'admin';
type User = { role: UserRole; name: string } | null;

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(null);
  const [view, setView] = useState<'home' | 'applyForm' | 'adminDashboard'>('home');
  const [applications, setApplications] = useState<any[]>([]);
  
  const totalReservedSeats = applications.reduce((total, app) => total + 1 + app.companions.length, 0);

  const handleLogin = (role: UserRole, name: string) => {
    setCurrentUser({ role, name });
    setView(role === 'admin' ? 'adminDashboard' : 'home');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('home');
  };

  const submitApplication = (applicationData: any) => {
    const newApp = {
      ...applicationData,
      id: Date.now(),
      applyTime: new Date().toISOString(),
      status: '대기',
    };
    setApplications([...applications, newApp]);
    setView('home');
    alert('신청이 완료되었습니다. 마이페이지(임시)에서 확인 가능합니다.');
  };

  const updateApplicationStatus = (id: number, newStatus: string) => {
    setApplications(applications.map(app => 
      app.id === id ? { ...app, status: newStatus } : app
    ));
  };

  const deleteApplication = (id: number) => {
    if(window.confirm('정말 이 신청을 취소/삭제 하시겠습니까?')) {
      setApplications(applications.filter(app => app.id !== id));
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="flex justify-center mb-4">
            <ShieldAlert size={48} className="text-red-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2 text-gray-800">수호신 원정버스 시스템</h1>
          <p className="text-gray-500 mb-8 text-sm">테스트를 위해 로그인 역할을 선택해주세요.</p>
          
          <div className="space-y-3">
            <button onClick={() => handleLogin('user', '일반수호신')} className="w-full py-3 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors">일반회원으로 로그인</button>
            <button onClick={() => handleLogin('auth_user', '인증수호신')} className="w-full py-3 px-4 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition-colors">인증회원으로 로그인 (우선예매)</button>
            <button onClick={() => handleLogin('admin', '최고관리자')} className="w-full py-3 px-4 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium transition-colors mt-4">관리자로 로그인</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800">
      <nav className="bg-red-600 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2 font-bold text-xl cursor-pointer" onClick={() => setView(currentUser.role === 'admin' ? 'adminDashboard' : 'home')}>
            <Bus size={24} />
            <span>수호신 원정버스</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm bg-red-700 px-3 py-1 rounded-full">
              {currentUser.name} ({currentUser.role === 'admin' ? '관리자' : currentUser.role === 'auth_user' ? '인증회원' : '일반회원'})
            </span>
            <button onClick={handleLogout} className="flex items-center space-x-1 hover:text-red-200 text-sm">
              <LogOut size={16} />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {view === 'home' && <UserHome schedule={INITIAL_SCHEDULE} reservedSeats={totalReservedSeats} onApplyClick={() => setView('applyForm')} currentUser={currentUser} applications={applications} />}
        {view === 'applyForm' && <ApplicationForm schedule={INITIAL_SCHEDULE} onCancel={() => setView('home')} onSubmit={submitApplication} currentUser={currentUser} />}
        {view === 'adminDashboard' && <AdminDashboard schedule={INITIAL_SCHEDULE} applications={applications} reservedSeats={totalReservedSeats} onUpdateStatus={updateApplicationStatus} onDelete={deleteApplication} />}
      </main>
    </div>
  );
}

// UserHome Component
function UserHome({ schedule, reservedSeats, onApplyClick, currentUser, applications }: any) {
  const isSoldOut = reservedSeats >= schedule.maxSeats;
  const myApplications = applications.filter((app: any) => app.representative.name === currentUser.name);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-600">
        <h2 className="text-lg font-bold mb-2 flex items-center">
          <AlertCircle size={20} className="mr-2 text-red-600" />
          신청 전 필독 공지사항
        </h2>
        <ul className="list-disc pl-5 text-gray-600 space-y-1 text-sm">
          <li>수호신 원정버스 규정을 꼭 확인 후 신청바랍니다.</li>
          <li>수호신 원정 버스는 <strong>개별양도가 절대 불가</strong> 합니다.</li>
          <li>미입금 및 신청 기간 이외 신청 시 통보 없이 취소됩니다.</li>
        </ul>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center">
            <Calendar size={20} className="mr-2" />
            {schedule.matchName}
          </h2>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${isSoldOut ? 'bg-red-500' : 'bg-green-500'}`}>
            {isSoldOut ? '마감됨' : '신청가능'}
          </span>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Clock className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="font-semibold text-gray-700">시간표 (예정)</p>
                <p className="text-sm text-gray-600">출발: {schedule.departureTime} (서울월드컵경기장)</p>
                <p className="text-sm text-gray-600">도착: {schedule.arrivalTime} (안양종합운동장)</p>
                <p className="text-sm text-gray-600 mt-1">복귀: {schedule.returnTime} 출발</p>
                <p className="text-sm text-gray-600">종료: {schedule.returnArrivalTime} (서울월드컵경기장)</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <MapPin className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="font-semibold text-gray-700">가격 / 정보</p>
                <p className="text-sm text-gray-600">왕복 편도 동일: {schedule.price.toLocaleString()}원</p>
                <p className="text-sm text-gray-600">운행 차량: {schedule.maxSeats}인승 일반버스</p>
                <p className="text-sm text-gray-600 text-red-600 mt-1">* 계좌: {schedule.accountInfo}</p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col justify-center items-center bg-gray-50 rounded-lg p-6 border border-gray-100">
            <div className="text-center mb-4">
              <p className="text-gray-500 text-sm mb-1">현재 예매 현황</p>
              <p className="text-3xl font-bold text-gray-800">
                <span className={isSoldOut ? 'text-red-600' : 'text-blue-600'}>{reservedSeats}</span> 
                <span className="text-xl text-gray-400"> / {schedule.maxSeats}</span>
              </p>
            </div>
            
            <button 
              onClick={onApplyClick}
              disabled={isSoldOut || currentUser.role === 'admin'}
              className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
                isSoldOut || currentUser.role === 'admin' 
                  ? 'bg-gray-300 cursor-not-allowed' 
                  : 'bg-red-600 hover:bg-red-700 shadow-md'
              }`}
            >
              {isSoldOut ? '선착순 마감' : currentUser.role === 'admin' ? '관리자는 신청불가' : '원정버스 신청하기'}
            </button>
            <p className="text-xs text-gray-400 mt-3">
              오픈: 인증회원 15:00 / 일반회원 17:00
            </p>
          </div>
        </div>
      </div>

      {myApplications.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-bold mb-4">나의 신청 내역</h2>
          <div className="space-y-3">
            {myApplications.map((app: any) => (
              <div key={app.id} className="border rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{app.representative.name} 외 {app.companions.length}명</p>
                  <p className="text-sm text-gray-500">총 결제금액: {((1 + app.companions.length) * schedule.price).toLocaleString()}원</p>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    app.status === '완료' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    입금 {app.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ApplicationForm Component
function ApplicationForm({ schedule, onCancel, onSubmit, currentUser }: any) {
  const [rep, setRep] = useState({ name: currentUser.name || '', phone: '', type: '왕복', location: '서울월드컵경기장' });
  const [companions, setCompanions] = useState<any[]>([]);

  const addCompanion = () => {
    setCompanions([...companions, { id: Date.now(), name: '', phone: '', type: '왕복', location: '서울월드컵경기장' }]);
  };

  const removeCompanion = (id: number) => {
    setCompanions(companions.filter(c => c.id !== id));
  };

  const updateCompanion = (id: number, field: string, value: string) => {
    setCompanions(companions.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!rep.name || !rep.phone) return alert('대표자 정보를 입력해주세요.');
    if(rep.phone.length < 10) return alert('올바른 연락처를 입력해주세요.');

    const totalPeople = 1 + companions.length;
    if(window.confirm(`총 ${totalPeople}명 신청하시겠습니까? (예상 금액: ${(totalPeople * schedule.price).toLocaleString()}원)`)) {
      onSubmit({ representative: rep, companions });
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md overflow-hidden">
      <div className="bg-red-600 p-4 text-white">
        <h2 className="text-xl font-bold">버스 탑승 신청</h2>
        <p className="text-sm text-red-100">{schedule.matchName} 원정</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        <section>
          <h3 className="text-lg font-bold border-b pb-2 mb-4 flex items-center">
            <Users className="mr-2 text-red-600" size={20} />
            대표자 정보
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">성함</label>
              <input type="text" value={rep.name} onChange={e => setRep({...rep, name: e.target.value})} className="w-full border rounded-md p-2" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
              <input type="text" value={rep.phone} onChange={e => setRep({...rep, phone: e.target.value})} className="w-full border rounded-md p-2" required placeholder="010-1234-5678"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">탑승 유형</label>
              <select value={rep.type} onChange={e => setRep({...rep, type: e.target.value})} className="w-full border rounded-md p-2">
                <option value="왕복">왕복</option>
                <option value="상행(서울행)">상행(서울행)</option>
                <option value="하행(안양행)">하행(안양행)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">탑승지</label>
              <input type="text" value={rep.location} onChange={e => setRep({...rep, location: e.target.value})} className="w-full border rounded-md p-2" required />
            </div>
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h3 className="text-lg font-bold flex items-center">
              <Users className="mr-2 text-gray-600" size={20} />
              동반 탑승자 정보 <span className="text-sm font-normal text-gray-500 ml-2">(총 {companions.length}명)</span>
            </h3>
            <button type="button" onClick={addCompanion} className="flex items-center text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-md">
              <Plus size={16} className="mr-1" /> 인원 추가
            </button>
          </div>

          {companions.map((comp, index) => (
            <div key={comp.id} className="relative bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
              <button type="button" onClick={() => removeCompanion(comp.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1">
                <Trash2 size={18} />
              </button>
              <p className="font-semibold text-sm mb-3 text-gray-600">탑승자 {index + 1}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" value={comp.name} onChange={e => updateCompanion(comp.id, 'name', e.target.value)} className="w-full border rounded-md p-2 text-sm" placeholder="성함" required />
                <input type="text" value={comp.phone} onChange={e => updateCompanion(comp.id, 'phone', e.target.value)} className="w-full border rounded-md p-2 text-sm" placeholder="연락처" required />
                <select value={comp.type} onChange={e => updateCompanion(comp.id, 'type', e.target.value)} className="w-full border rounded-md p-2 text-sm">
                  <option value="왕복">왕복</option>
                  <option value="상행(서울행)">상행(서울행)</option>
                  <option value="하행(안양행)">하행(안양행)</option>
                </select>
                <input type="text" value={comp.location} onChange={e => updateCompanion(comp.id, 'location', e.target.value)} className="w-full border rounded-md p-2 text-sm" placeholder="탑승지" required />
              </div>
            </div>
          ))}
        </section>

        <div className="bg-red-50 p-4 rounded-lg border border-red-100 flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">총 결제 예정 금액</p>
            <p className="text-2xl font-bold text-red-600">{((1 + companions.length) * schedule.price).toLocaleString()}원</p>
          </div>
          <div className="space-x-3">
            <button type="button" onClick={onCancel} className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">취소</button>
            <button type="submit" className="px-8 py-3 bg-gray-800 text-white font-bold rounded-lg hover:bg-gray-900 shadow-md">신청 완료하기</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// AdminDashboard Component
function AdminDashboard({ schedule, applications, reservedSeats, onUpdateStatus, onDelete }: any) {
  const flattenedList: any[] = [];
  applications.forEach((app: any) => {
    flattenedList.push({ ...app.representative, appId: app.id, isRep: true, status: app.status, applyTime: new Date(app.applyTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' }) });
    app.companions.forEach((comp: any) => {
      flattenedList.push({ ...comp, appId: app.id, isRep: false, status: app.status, applyTime: '-' });
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center">
          <ShieldAlert className="mr-2 text-gray-800" size={24} /> 관리자 대시보드
        </h2>
        <div className="bg-white px-4 py-2 rounded-lg shadow-sm font-bold border border-gray-200">
          총 탑승인원: <span className="text-red-600">{reservedSeats}</span> / {schedule.maxSeats}명
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-700">{schedule.matchName} 신청자 명단</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3">구분</th><th className="px-6 py-3">이름</th><th className="px-6 py-3">연락처</th>
                <th className="px-6 py-3">유형/탑승지</th><th className="px-6 py-3">신청시간</th><th className="px-6 py-3">상태</th><th className="px-6 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {flattenedList.length === 0 ? <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">신청자가 없습니다.</td></tr> : 
                flattenedList.map((row, idx) => (
                  <tr key={`${row.appId}-${idx}`} className={`border-b ${row.isRep ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-6 py-3">{row.isRep ? <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded font-bold">대표</span> : <span className="px-2 py-1 text-gray-500 text-xs">동반</span>}</td>
                    <td className="px-6 py-3 font-medium text-gray-900">{row.name}</td>
                    <td className="px-6 py-3">{row.phone}</td>
                    <td className="px-6 py-3">{row.type} / {row.location}</td>
                    <td className="px-6 py-3 text-gray-500">{row.applyTime}</td>
                    <td className="px-6 py-3">{row.isRep && (row.status === '완료' ? <span className="text-green-600 font-bold">완료</span> : <span className="text-yellow-600 font-bold">대기중</span>)}</td>
                    <td className="px-6 py-3 text-center">
                      {row.isRep && (
                        <div className="flex justify-center space-x-2">
                          <button onClick={() => onUpdateStatus(row.appId, row.status === '대기' ? '완료' : '대기')} className={`px-2 py-1 text-xs rounded text-white ${row.status === '대기' ? 'bg-indigo-500' : 'bg-gray-400'}`}>{row.status === '대기' ? '입금확인' : '취소'}</button>
                          <button onClick={() => onDelete(row.appId)} className="text-red-500 hover:bg-red-50 p-1"><Trash2 size={16}/></button>
                        </div>
                      )}
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