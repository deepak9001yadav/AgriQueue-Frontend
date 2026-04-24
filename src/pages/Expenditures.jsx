import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Chart } from 'chart.js/auto';
import Swal from 'sweetalert2';
import api from '../utils/api';
import './Expenditures.css';

function Expenditures() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    
    const [expenditures, setExpenditures] = useState([]);
    const [fields, setFields] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [seasonFilter, setSeasonFilter] = useState('All');
    
    const [formData, setFormData] = useState({
        amount: '',
        category: 'Seeds',
        date: new Date().toISOString().split('T')[0],
        field_id: '',
        description: '',
        season: 'Rabi',
        quantity: '',
        unit: 'Kg'
    });

    const categories = [
        'Seeds', 'Fertilizer', 'Labor', 'Irrigation', 'Machinery', 'Pesticides', 'Other'
    ];
    const seasonsDef = ['Rabi', 'Kharif', 'Zaid', 'Annual'];
    const unitsDef = ['Kg', 'Liters', 'Bags', 'Tons', 'Pieces', 'Other'];

    // Dark mode toggle
    useEffect(() => {
        const savedMode = localStorage.getItem('darkMode') === 'true';
        setIsDarkMode(savedMode);
        if (savedMode) document.body.classList.add('dark-mode');
    }, []);

    const toggleDarkMode = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        document.body.classList.toggle('dark-mode', newMode);
        localStorage.setItem('darkMode', newMode);
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Data loading
    useEffect(() => {
        const loadData = async () => {
            try {
                const [expData, fieldsData] = await Promise.all([
                    api.getExpenditures(),
                    api.getFields()
                ]);
                setExpenditures(expData || []);
                setFields(fieldsData || []);
            } catch (err) {
                console.error('Error fetching data', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // Filtered data
    const filteredExpenditures = expenditures.filter(exp => 
        seasonFilter === 'All' ? true : exp.season === seasonFilter
    );

    // Chart Configuration
    useEffect(() => {
        if (loading || filteredExpenditures.length === 0) return;
        const ctx = document.getElementById('expenditureChart');
        if (!ctx) return;
        
        // Aggregate by category
        const categoryTotals = {};
        filteredExpenditures.forEach(exp => {
            categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
        });
        
        const chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(categoryTotals),
                datasets: [{
                    data: Object.values(categoryTotals),
                    backgroundColor: [
                        '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#F44336', '#607D8B'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
        
        return () => chartInstance.destroy();
    }, [filteredExpenditures, loading]);

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    const totalSpent = filteredExpenditures.reduce((sum, exp) => sum + exp.amount, 0);
    
    // Sort logic to find max category
    const categoryTotalsArr = Object.entries(filteredExpenditures.reduce((acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
        return acc;
    }, {})).sort((a,b) => b[1] - a[1]);
    const maxCategory = categoryTotalsArr.length > 0 ? categoryTotalsArr[0][0] : 'N/A';

    // CSV Download
    const downloadReport = () => {
        if (filteredExpenditures.length === 0) return Swal.fire('No Data', 'No data to export for this season.', 'info');
        const headers = ["Date,Season,Category,Field,Amount(INR),Quantity,Unit,Description"];
        const rows = filteredExpenditures.map(exp => {
            const fieldName = fields.find(f => f.id === exp.field_id)?.name || 'General';
            return `"${exp.date}","${exp.season || ''}","${exp.category}","${fieldName}","${exp.amount}","${exp.quantity || ''}","${exp.unit || ''}","${exp.description || ''}"`;
        });
        const csvContent = "data:text/csv;charset=utf-8,\n" + headers.concat(rows).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Expenditure_Report_${seasonFilter}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Handle Form Submit
    const handleAddExpenditure = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                amount: parseFloat(formData.amount),
                quantity: formData.quantity ? parseFloat(formData.quantity) : null,
                field_id: formData.field_id ? parseInt(formData.field_id) : null
            };
            const res = await api.addExpenditure(payload);
            if (res.success) {
                // Refresh list
                const data = await api.getExpenditures();
                setExpenditures(data);
                setIsModalOpen(false);
                setFormData({
                    amount: '', category: 'Seeds', date: new Date().toISOString().split('T')[0], field_id: '', description: '', season: 'Rabi', quantity: '', unit: 'Kg'
                });
                Swal.fire({ icon: 'success', title: 'Added!', timer: 1500, showConfirmButton: false });
            }
        } catch (error) {
            Swal.fire('Error', 'Failed to add expenditure', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this expenditure?')) return;
        try {
            await api.deleteExpenditure(id);
            setExpenditures(expenditures.filter(e => e.id !== id));
        } catch(error) {
            Swal.fire('Error', 'Failed to delete', 'error');
        }
    };

    return (
        <div className="dashboard-page">
            <header className="dashboard-header">
                <div className="nav-left">
                    <Link to="/dashboard" className="brand">
                        <img src="/static/Logo.jpg" alt="KrishiZest" style={{ height: 48 }} />
                    </Link>
                    <nav className="nav-links">
                        <Link to="/dashboard" className="nav-link">Dashboard</Link>
                        <Link to="/fields" className="nav-link">Fields</Link>
                        <Link to="/expenditures" className="nav-link active">Expenditures</Link>
                    </nav>
                </div>
                <div className="nav-right">
                    <button className="theme-toggle" onClick={toggleDarkMode}>
                        <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
                    </button>
                    <div className={`profile-dropdown ${showProfileMenu ? 'active' : ''}`}>
                        <button className="profile-btn" onClick={() => setShowProfileMenu(!showProfileMenu)}>
                            {user?.photoURL ? (
                                <img src={user.photoURL} alt="Profile" className="avatar-image" />
                            ) : (
                                <div className="avatar">
                                    {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                                </div>
                            )}
                        </button>
                        <div className="profile-menu">
                            <div className="user-info">
                                <div className="user-name">{user?.name || 'User'}</div>
                                <div className="user-email">{user?.email}</div>
                            </div>
                            <button className="dropdown-item" onClick={handleLogout}>
                                <i className="fas fa-sign-out-alt"></i> Logout
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="dashboard-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
                <div className="card" style={{ textAlign: 'center', padding: '50px', maxWidth: '500px', width: '100%' }}>
                    <i className="fas fa-tools" style={{ fontSize: '4rem', color: 'var(--primary-color)', marginBottom: '20px' }}></i>
                    <h1 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', marginBottom: '15px' }}>Coming Soon</h1>
                    <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
                        The expenditure feature is currently paused and will be available soon.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Expenditures;
