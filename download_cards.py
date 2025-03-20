import requests
import os
from concurrent.futures import ThreadPoolExecutor
import argparse
from tqdm import tqdm

def download_image(url, save_path):
    """指定されたURLから画像をダウンロードして保存する"""
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()  # エラーがあれば例外を発生
        
        with open(save_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"ダウンロード失敗 {url}: {e}")
        return False

def download_images(base_url, start_num, end_num, output_dir, max_workers=5):
    """指定された範囲の画像を並列ダウンロードする"""
    # 出力ディレクトリがなければ作成
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # ダウンロードタスクのリストを作成
    tasks = []
    for num in range(start_num, end_num + 1):
        url = base_url.replace("1000", str(num))
        filename = url.split('/')[-1]
        save_path = os.path.join(output_dir, filename)
        tasks.append((url, save_path))
    
    # 並列ダウンロードを実行
    successful_downloads = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        with tqdm(total=len(tasks), desc="ダウンロード中") as progress_bar:
            futures = []
            for url, save_path in tasks:
                future = executor.submit(download_image, url, save_path)
                future.add_done_callback(lambda p: progress_bar.update(1))
                futures.append(future)
            
            # 結果を集計
            for future in futures:
                if future.result():
                    successful_downloads += 1
    
    print(f"\n完了: {successful_downloads}/{len(tasks)} 個のファイルをダウンロードしました")

def main():
    parser = argparse.ArgumentParser(description='URLの数値部分をインクリメントしながら画像をダウンロード')
    parser.add_argument('base_url', help='ベースURL (例: https://i7.step-on-dream.net/img/cards/1000.png)')
    parser.add_argument('start_num', type=int, help='開始番号')
    parser.add_argument('end_num', type=int, help='終了番号')
    parser.add_argument('--output', '-o', default='downloaded_images', help='出力ディレクトリ')
    parser.add_argument('--workers', '-w', type=int, default=5, help='並列ダウンロード数')
    
    args = parser.parse_args()
    
    download_images(args.base_url, args.start_num, args.end_num, args.output, args.workers)

if __name__ == "__main__":
    main() 