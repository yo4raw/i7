import os
import time
import requests
from concurrent.futures import ThreadPoolExecutor
from tqdm import tqdm

def download_image(image_id, base_url, save_dir, max_retries=3, delay=0.5):
    """指定されたIDの画像をダウンロードする関数"""
    url = f"{base_url}/{image_id}.png"
    filename = os.path.join(save_dir, f"{image_id}.png")
    
    # 既にファイルが存在する場合はスキップ
    if os.path.exists(filename):
        return True, image_id, "既存"
    
    for attempt in range(max_retries):
        try:
            response = requests.get(url, stream=True, timeout=10)
            response.raise_for_status()  # エラーレスポンスの場合は例外を発生
            
            # 画像データを保存
            with open(filename, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            time.sleep(delay)  # サーバーに負荷をかけないよう遅延
            return True, image_id, "成功"
        
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                time.sleep(delay * (attempt + 1))  # リトライ間隔を徐々に増やす
            else:
                return False, image_id, str(e)

def main():
    # 設定パラメータ
    base_url = "https://i7.step-on-dream.net/img/cards"
    save_dir = "downloaded_images"
    start_id = 1
    max_concurrent = 5  # 同時ダウンロード数
    
    # 保存ディレクトリがなければ作成
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    
    print(f"画像のダウンロードを開始します。保存先: {save_dir}")
    
    # ダウンロード処理
    current_id = start_id
    consecutive_failures = 0
    max_consecutive_failures = 10  # 連続失敗数の上限
    
    with ThreadPoolExecutor(max_workers=max_concurrent) as executor:
        while consecutive_failures < max_consecutive_failures:
            batch_size = 20  # 一度に処理するバッチサイズ
            futures = [
                executor.submit(download_image, id, base_url, save_dir)
                for id in range(current_id, current_id + batch_size)
            ]
            
            # 進捗バーを表示しながら結果を処理
            results = []
            for future in tqdm(futures, desc=f"ID {current_id}〜{current_id + batch_size - 1} 処理中"):
                results.append(future.result())
            
            # 結果の集計
            for success, image_id, message in results:
                if success:
                    consecutive_failures = 0
                    print(f"ID {image_id}: {message}")
                else:
                    consecutive_failures += 1
                    print(f"ID {image_id}: 失敗 - {message}")
                    
                    # 連続失敗が上限に達したらループを終了
                    if consecutive_failures >= max_consecutive_failures:
                        print(f"{consecutive_failures}回連続で失敗したため終了します。")
                        break
            
            current_id += batch_size
    
    print("ダウンロード処理が完了しました。")

if __name__ == "__main__":
    main() 