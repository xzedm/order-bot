import React, { useState } from 'react';
import { 
  Search, Filter, Download, Eye, Edit, Trash2, Plus, 
  Users, Package, MessageSquare, BarChart3, Settings,
  ChevronDown, ChevronRight, X, Check, Clock, Truck,
  Phone, Mail, MapPin, Calendar, FileText, RefreshCw
} from 'lucide-react';

// Type Definitions
type Status = 'new' | 'pending' | 'confirmed' | 'paid' | 'shipped' | 'closed' | 'cancelled';

interface StatusConfig {
  [key: string]: { label: string; color: string };
}

interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  orders?: number;
  totalSpent?: number;
  lastOrder?: Date;
}

interface Item {
  name: string;
  qty: number;
  price: number;
  sku: string;
}

interface Order {
  id: number;
  number: string;
  status: Status;
  customer: Customer;
  total: number;
  currency: string;
  items: Item[];
  channel: string;
  createdAt: Date;
  managerId: number | null;
}

interface Filters {
  status: Status | 'all';
  dateFrom: string;
  dateTo: string;
  search: string;
}

// Mock Data
const mockOrders: Order[] = [
  {
    id: 1,
    number: 'KG-2025-000123',
    status: 'new',
    customer: { id: 1, name: 'Иван Петров', phone: '+7 701 123 45 67', email: 'ivan@example.com' },
    total: 45000,
    currency: '₸',
    items: [
      { name: 'Arduino Uno R3', qty: 3, price: 8500, sku: 'ARD-UNO-R3' },
      { name: 'Raspberry Pi 4 4GB', qty: 2, price: 21000, sku: 'RPI4-4GB' }
    ],
    channel: 'telegram',
    createdAt: new Date('2025-01-10T10:30:00'),
    managerId: null
  },
  {
    id: 2,
    number: 'KG-2025-000124',
    status: 'confirmed',
    customer: { id: 2, name: 'Анна Смирнова', phone: '+7 702 987 65 43', email: 'anna@example.com' },
    total: 25500,
    currency: '₸',
    items: [
      { name: 'ESP32 DevKit', qty: 5, price: 5100, sku: 'ESP32-DEV' }
    ],
    channel: 'web',
    createdAt: new Date('2025-01-09T14:20:00'),
    managerId: 1
  },
  {
    id: 3,
    number: 'KG-2025-000125',
    status: 'paid',
    customer: { id: 3, name: 'Сергей Козлов', phone: '+7 705 456 78 90', email: null },
    total: 12000,
    currency: '₸',
    items: [
      { name: 'Grove Starter Kit', qty: 1, price: 12000, sku: 'GROVE-START' }
    ],
    channel: 'telegram',
    createdAt: new Date('2025-01-08T09:15:00'),
    managerId: 1
  }
];

const mockCustomers: Customer[] = [
  {
    id: 1,
    name: 'Иван Петров',
    phone: '+7 701 123 45 67',
    email: 'ivan@example.com',
    orders: 3,
    totalSpent: 75000,
    lastOrder: new Date('2025-01-10T10:30:00')
  },
  {
    id: 2,
    name: 'Анна Смирнова',
    phone: '+7 702 987 65 43',
    email: 'anna@example.com',
    orders: 1,
    totalSpent: 25500,
    lastOrder: new Date('2025-01-09T14:20:00')
  }
];

const statusConfig: StatusConfig = {
  new: { label: 'Новый', color: 'bg-blue-100 text-blue-800' },
  pending: { label: 'В обработке', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Подтверждён', color: 'bg-green-100 text-green-800' },
  paid: { label: 'Оплачен', color: 'bg-purple-100 text-purple-800' },
  shipped: { label: 'Отгружен', color: 'bg-indigo-100 text-indigo-800' },
  closed: { label: 'Закрыт', color: 'bg-gray-100 text-gray-800' },
  cancelled: { label:'Отменён', color: 'bg-red-100 text-red-800' },
};

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'analytics'>('orders');
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [filters, setFilters] = useState<Filters>({ status: 'all', dateFrom: '', dateTo: '', search: '' });

  // Filter orders based on current filters
  const filteredOrders = orders.filter(order => {
    if (filters.status !== 'all' && order.status !== filters.status) return false;
    if (filters.search && !order.number.toLowerCase().includes(filters.search.toLowerCase()) 
        && !order.customer.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.dateFrom && new Date(order.createdAt) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(order.createdAt) > new Date(filters.dateTo)) return false;
    return true;
  });

  const updateOrderStatus = (orderId: number, newStatus: Status) => {
    setOrders(prev => prev.map(order => 
      order.id === orderId ? { ...order, status: newStatus } : order
    ));
  };

  const exportOrders = () => {
    const csvContent = [
      ['Номер заказа', 'Статус', 'Клиент', 'Телефон', 'Сумма', 'Канал', 'Дата создания'].join(','),
      ...filteredOrders.map(order => [
        order.number,
        statusConfig[order.status].label,
        order.customer.name,
        order.customer.phone,
        order.total,
        order.channel,
        order.createdAt.toLocaleDateString('ru-RU')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const OrderModal = () => {
    if (!selectedOrder) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-2xl w-full m-4 max-h-90vh overflow-y-auto">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Заказ {selectedOrder.number}</h2>
              <button
                onClick={() => setShowOrderModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Статус</label>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => {
                    const newStatus = e.target.value as Status;
                    updateOrderStatus(selectedOrder.id, newStatus);
                    setSelectedOrder(prev => prev ? ({ ...prev, status: newStatus }) : null);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Менеджер</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="">Не назначен</option>
                  <option value="1">Иван Иванов</option>
                  <option value="2">Петр Петров</option>
                </select>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Информация о клиенте</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-gray-500" />
                  <span>{selectedOrder.customer.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-gray-500" />
                  <span>{selectedOrder.customer.phone}</span>
                </div>
                {selectedOrder.customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-gray-500" />
                    <span>{selectedOrder.customer.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-gray-500" />
                  <span className="capitalize">{selectedOrder.channel}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Товары</h3>
              <div className="space-y-3">
                {selectedOrder.items.map((item: Item, index: number) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-sm text-gray-500">SKU: {item.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{(item.price * item.qty).toLocaleString()} ₸</div>
                        <div className="text-sm text-gray-500">{item.qty} × {item.price.toLocaleString()} ₸</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Итого:</span>
                  <span>{selectedOrder.total.toLocaleString()} {selectedOrder.currency}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => setShowOrderModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Закрыть
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Сохранить изменения
            </button>
          </div>
        </div>
      </div>
    );
  };

  const OrdersTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Поиск по номеру или имени клиента..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as Status | 'all' }))}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="all">Все статусы</option>
            {Object.entries(statusConfig).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />
          
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2"
          />

          <button
            onClick={exportOrders}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            <Download size={16} />
            Экспорт CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Номер заказа</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Статус</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Клиент</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Сумма</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Канал</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Дата</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{order.number}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusConfig[order.status].color}`}>
                      {statusConfig[order.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium">{order.customer.name}</div>
                      <div className="text-sm text-gray-500">{order.customer.phone}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{order.total.toLocaleString()} {order.currency}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize bg-gray-100 px-2 py-1 rounded text-xs">
                      {order.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {order.createdAt.toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setShowOrderModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                        title="Просмотр"
                      >
                        <Eye size={16} />
                      </button>
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value as Status)}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        {Object.entries(statusConfig).map(([key, config]) => (
                          <option key={key} value={key}>{config.label}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const CustomersTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Клиент</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Контакты</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Заказов</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Потрачено</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Последний заказ</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{customer.name}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-1">
                        <Phone size={12} />
                        {customer.phone}
                      </div>
                      {customer.email && (
                        <div className="flex items-center gap-1">
                          <Mail size={12} />
                          {customer.email}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">{customer.orders}</td>
                  <td className="px-4 py-3 font-semibold">{customer.totalSpent?.toLocaleString()} ₸</td>
                  <td className="px-4 py-3 text-sm">
                    {customer.lastOrder?.toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-blue-600 hover:text-blue-800" title="Просмотр заказов">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const AnalyticsTab = () => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
    const statusCounts = orders.reduce((acc: Record<Status, number>, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {
      new: 0,
      pending: 0,
      confirmed: 0,
      paid: 0,
      shipped: 0,
      closed: 0,
      cancelled: 0,
    });

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2traffic rounded-lg">
                <FileText className="text-blue-600" size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalOrders}</div>
                <div className="text-sm text-gray-600">Всего заказов</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <BarChart3 className="text-green-600" size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold">{totalRevenue.toLocaleString()} ₸</div>
                <div className="text-sm text-gray-600">Общий доход</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Users className="text-purple-600" size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold">{customers.length}</div>
                <div className="text-sm text-gray-600">Клиентов</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-orange-100 p-2 rounded-lg">
                <Clock className="text-orange-600" size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold">{Math.round(totalRevenue / totalOrders).toLocaleString()} ₸</div>
                <div className="text-sm text-gray-600">Средний чек</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Распределение по статусам</h3>
          <div className="space-y-3">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusConfig[status as Status].color}`}>
                    {statusConfig[status as Status].label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${(count / totalOrders) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-900">Kerneu Group Admin</h1>
            </div>
            <div className="flex items-center gap-4">
              <button className="text-gray-500 hover:text-gray-700">
                <Settings size={20} />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">ИИ</span>
                </div>
                <span className="text-sm text-gray-700">Admin</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="mb-8">
          <div className="flex space-x-8">
            {[
              { id: 'orders', label: 'Заказы', icon: FileText },
              { id: 'customers', label: 'Клиенты', icon: Users },
              { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as 'orders' | 'customers' | 'analytics')}
                className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'customers' && <CustomersTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
      </div>

      {showOrderModal && <OrderModal />}
    </div>
  );
};

export default AdminPanel;