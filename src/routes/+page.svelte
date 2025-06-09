<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import CardHeader from '$lib/components/CardHeader.svelte';
	import CardContent from '$lib/components/CardContent.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
</script>

<div class="max-w-7xl mx-auto px-4 py-8">
	<div class="mb-8">
		<h1 class="text-4xl font-bold text-gray-800 mb-2">アイドリッシュセブン カードデータベース 🎵</h1>
		<Badge variant="secondary">Powered by Rabee UI</Badge>
		<Badge variant="default" className="ml-2">Hot Reload Enabled 🔥</Badge>
	</div>
	
	<Card className="mb-6">
		<CardHeader>
			<h2 class="text-2xl font-semibold text-gray-700">ようこそ！</h2>
		</CardHeader>
		<CardContent>
			<p class="text-gray-600 mb-2">アイドリッシュセブンのカード情報を管理するデータベースシステムです。</p>
			<p class="text-gray-600">Google Sheetsから自動的にデータを取得し、検索可能な形で提供します。</p>
		</CardContent>
	</Card>
	
	<div class="bg-white rounded-lg shadow-md p-6 mb-6">
		<h2 class="text-2xl font-semibold text-gray-700 mb-4">機能</h2>
		<ul class="space-y-2 mb-6">
			<li class="flex items-center text-gray-600">
				<span class="mr-2">📊</span>
				<span>カード一覧の閲覧</span>
			</li>
			<li class="flex items-center text-gray-600">
				<span class="mr-2">🔍</span>
				<span>カード検索</span>
			</li>
			<li class="flex items-center text-gray-600">
				<span class="mr-2">📱</span>
				<span>カード詳細情報</span>
			</li>
			<li class="flex items-center text-gray-600">
				<span class="mr-2">⭐</span>
				<span>レアリティ別フィルター</span>
			</li>
			<li class="flex items-center text-gray-600">
				<span class="mr-2">👥</span>
				<span>キャラクター別フィルター</span>
			</li>
		</ul>
		<Button href="/cards" size="lg">
			カード一覧を見る
		</Button>
	</div>
	
	<div class="bg-white rounded-lg shadow-md p-6">
		<h2 class="text-2xl font-semibold text-gray-700 mb-4">データソース</h2>
		<p class="text-gray-600 mb-2">
			データは<a href="https://docs.google.com/spreadsheets/d/1LifgqDiRlQOIhP8blqEngJhI_Nnagbo8uspwmfg72fY/edit?gid=0#gid=0" target="_blank" class="text-blue-600 underline hover:text-blue-800">Google Sheets</a>から自動的に取得されます。
		</p>
		<p class="text-gray-600">Docker初回起動時に最新データがインポートされます。</p>
	</div>
</div>