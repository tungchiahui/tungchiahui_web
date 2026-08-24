### 图像的灰度化和二值化

C++

```cpp
#include <cstdio>
#include <opencv2/opencv.hpp>


// 图片灰度化与二值化

int main(int argc, char ** argv)
{
    (void) argc;
    (void) argv;
    // 读取图片
    cv::Mat pic_src = cv::imread("/home/ros2u/map.jpg"); //请自行修改图片路径

    // 灰度化
    // 声明一个用于存放灰度图像的变量
    cv::Mat pic_gray;
    // 转换为灰度图像
    cv::cvtColor(pic_src, pic_gray, cv::COLOR_BGR2GRAY);
    cv::imwrite("/home/ros2u/map_gray.jpg", pic_gray);

    // 声明一个用于存放二值化图像的变量
    cv::Mat pic;
    // 应用图像二值化
    cv::threshold(pic_gray, pic, 127, 255, cv::THRESH_BINARY);
    cv::imwrite("/home/ros2u/map_binary.jpg", pic);


    // 显示图片
    cv::imshow("my_pic", pic);
    // 使显示窗口一直处于打开状态
    cv::waitKey(0);

    return 0;
}
```

Python实现

```py
import cv2

def main(args=None):

    # 读取图片
    pic_src = cv2.imread("/home/ros2u/map.jpg")  # 请自行修改图片路径

    # 灰度化
    pic_gray = cv2.cvtColor(pic_src, cv2.COLOR_BGR2GRAY)
    cv2.imwrite("/home/ros2u/map_gray_py.jpg", pic_gray)

    # # 应用图像二值化
    _,pic = cv2.threshold(pic_gray, 127, 255, cv2.THRESH_BINARY)
    cv2.imwrite("/home/ros2u/map_binary_py.jpg", pic)

    # 显示图片
    cv2.imshow("my_pic", pic)

    # 使显示窗口一直处于打开状态
    cv2.waitKey(0)


if __name__ == '__main__':
    main()
```



